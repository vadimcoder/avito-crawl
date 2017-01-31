'use strict';

const request = require('request-promise-native');
const cheerio = require('cheerio');
const mongo = require('mongodb');
const _ = require('lodash');
const assert = require('assert');

const DB_NAME = 'avito';
const CONNECTION_STRING = `mongodb://localhost:27017/${DB_NAME}`;
const MAIN_COLLECTION_NAME = 'task1';
const CURRENT_PAGE_NUMBER_COLLECTION_NAME = 'task1_current_page_number';
const SUCCESSFUL_EXIT_CODE = 0;

let DB;

async function saveItem(href, title, task1Collection) {
    let result = await task1Collection.find({href: href}).toArray();

    if (result.length === 0) {
        result = await task1Collection.insertOne({href: href, title: title, checked_count: 1, is_expired: false});
        assert(result.result.ok, `Failed to insert a row for href ${href}`);
    } else if (result.length === 1) {
        let item = result[0];
        result = await task1Collection.updateOne({href: item.href}, {$set: {title: title, checked_count: ++item.checked_count}});
        assert(result.result.ok, `Failed to update a row for href ${href}`);
    } else {
        throw new Error(`Items count for a given href ${href} must be 0 (not found) or 1 (found)`);
    }
}

async function crawlAvito(currentPageNumber, currentPageNumberCollection, task1Collection) {
    let response = await request({
        uri: `https://www.avito.ru/moskva/kollektsionirovanie/monety?p=${currentPageNumber}`,
        resolveWithFullResponse: true,
        followRedirect: function () {
            return false;
        },
        headers: {
            'User-Agent': 'Vadim Vinogradov (vadim.vinogradov@gmail.com). Avito BI contest. Sorry :)'
        },
        simple: false
    });

    if (response.statusCode === 200) {
        console.log(`=================== Current page number: ${currentPageNumber} ===================`);
        const $ = cheerio.load(response.body);

        const items = [...$('.js-catalog_before-ads').children().toArray(),
            ...$('.js-catalog_after-ads').children().toArray()];

        for (let item of items) {
            const h3 = $(item).find('h3');

            if (h3[0]) {
                const href = _.last(h3.find('a').attr('href').split('/'));
                const title = h3.text().trim();
                await saveItem(href, title, task1Collection);
            } else {
                // it is ads
            }
        }
        console.log(`${items.length} items processed`);
        currentPageNumber++;
    } else if (response.statusCode === 302) {
        currentPageNumber = 1;
    } else {
        console.log(`Unexpected status code: ${response.statusCode}. Continue`);
    }

    currentPageNumberCollection.updateOne({}, {$set: {current_page_number: currentPageNumber}});
    crawlAvito(currentPageNumber, currentPageNumberCollection, task1Collection);
}

async function connect() {
    return mongo.connect(CONNECTION_STRING);
}

async function main(db) {
    const currentPageNumberCollection = db.collection(CURRENT_PAGE_NUMBER_COLLECTION_NAME);
    const task1Collection = db.collection(MAIN_COLLECTION_NAME);
    const currentPageNumberObject = await currentPageNumberCollection.findOne();

    let currentPageNumber;
    if (currentPageNumberObject === null) {
        currentPageNumber = 1;
        await currentPageNumberCollection.insertOne({current_page_number: currentPageNumber});
    } else {
        currentPageNumber = currentPageNumberObject.current_page_number;
    }

    console.log(`Start with: ${currentPageNumber}`);

    crawlAvito(currentPageNumber, currentPageNumberCollection, task1Collection);

    return db;
}

(async() => {
    try {
        DB = await connect();
        console.log('mongo connected');
        await main(DB);
    } catch (error) {
        console.log(error);
        gracefulExit();
    }
})();

function gracefulExit() {
    function exit(error) {
        console.log(`Exited gracefully. Errors: ${error}`);
        process.exit(SUCCESSFUL_EXIT_CODE);
    }

    if (DB) {
        console.log('Try to close DB connection');
        DB.close().then(() => {
            console.log('Connection is closed');
            exit();
        });
    } else {
        exit();
    }

}

process
    .on('SIGINT', () => {
        console.log('Got SIGINT. Try to exit gracefully');
        gracefulExit();
    })
    .on('SIGTERM', () => {
        console.log('Got SIGTERM. Try to exit gracefully');
        gracefulExit();
    });