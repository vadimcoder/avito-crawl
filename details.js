'use strict';

const request = require('request-promise-native');
const cheerio = require('cheerio');
const mongo = require('mongodb');

const constants = require('./common').constants;
const STATUS_COLLECTION_NAME = 'task1_details_status';
const SUCCESSFUL_EXIT_CODE = 0;

let DB;

async function connect() {
    return mongo.connect(constants.CONNECTION_STRING);
}

async function main(db) {
    const task1Collection = db.collection(constants.MAIN_COLLECTION_NAME);
    const task1DetailsStatusCollection = db.collection(STATUS_COLLECTION_NAME);

    await crawlAvito(task1Collection, task1DetailsStatusCollection);
}

async function grepData(task1Collection, advertisement, body) {
    const $ = cheerio.load(body);
    console.log(advertisement.href);
    const title = $('.title-info-title > span').text();
    const itemDescription = $('.item-description');

    if (itemDescription.length) {
        const advertisementBody = $(itemDescription
            .html()
            .replace(/<br>/g, '\n')
            .replace(/<p>/g, '\n')
            .replace(/<\/p>/g, '\n'))
            .text();
        await task1Collection.updateOne({href: advertisement.href}, {
            $set: {
                title: title,
                advertisementBody: advertisementBody
            }
        });
    }
}

function mySetTimeout() {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, 3000);
    });
}

async function work(task1Collection, advertisement) {
    try {
        let response = await request({
            uri: `https://www.avito.ru/moskva/kollektsionirovanie/${advertisement.href}`,
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
            await grepData(task1Collection, advertisement, response.body);
        } else if (response.statusCode === 302) {
            console.log(`${advertisement.href} expired`);
            await task1Collection.updateOne({href: advertisement.href}, {$set: {is_expired: true}});
        } else {
            console.log(`Unknown status code ${response.statusCode} for href ${advertisement.href}`);
        }
    } catch (exception) {
        console.log(`Caught exception: ${exception}. Waiting...`);
        await mySetTimeout();
    }
}

async function crawlAvito(task1Collection, task1DetailsStatusCollection) {
    let advertisement;
    while (true) {
        let cursor;
        const statusObject = await task1DetailsStatusCollection.findOne();

        if (statusObject === null) {
            // first run
            await task1DetailsStatusCollection.insertOne({insertedId: 0});
            cursor = await task1Collection.find({is_expired: false});
        } else if (statusObject.insertedId === 0) {
            cursor = await task1Collection.find({is_expired: false});
        } else {
            cursor = await task1Collection.find({_id: {$gt: statusObject.insertedId}, is_expired: false});
        }

        while ((advertisement = await cursor.next()) !== null) {
            await work(task1Collection, advertisement);
            await task1DetailsStatusCollection.updateOne({}, {$set: {insertedId: advertisement._id}});
        }

        await task1DetailsStatusCollection.updateOne({}, {$set: {insertedId: 0}});
    }
}

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


process
    .on('SIGINT', () => {
        console.log('Got SIGINT. Try to exit gracefully');
        gracefulExit();
    })
    .on('SIGTERM', () => {
        console.log('Got SIGTERM. Try to exit gracefully');
        gracefulExit();
    });
