'use strict';

const request = require('request-promise-native');
const cheerio = require('cheerio');
const mongo = require('mongodb');
const _ = require('lodash');
const assert = require('assert');

const constants = require('./common').constants;
const SUCCESSFUL_EXIT_CODE = 0;

const AVITO_MAX_PAGE_CRAWL_ALLOWED = 100;
let DB;

async function connect() {
    return mongo.connect(constants.CONNECTION_STRING);
}

async function main(db) {
    const task1Collection = db.collection(constants.MAIN_COLLECTION_NAME);

    await crawlAvito(task1Collection);
}

async function saveItem(href, title, task1Collection) {
    let result = await task1Collection.find({href: href}).toArray();

    if (result.length === 0) {
        result = await task1Collection.insertOne({href: href, title: title, checked_count: 1, is_expired: false});
        assert(result.result.ok, `Failed to insert a row for ${href}`);
    } else if (result.length === 1) {
        let item = result[0];
        result = await task1Collection.updateOne({href: item.href}, {
            $set: {
                title: title,
                checked_count: ++item.checked_count
            }
        });
        assert(result.result.ok, `Failed to update a row for ${href}`);
    } else {
        throw new Error(`Items count for a given href ${href} must be 0 (not found) or 1 (found)`);
    }
}


async function grepData($, task1Collection) {
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
}

function mySetTimeout() {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, 3000);
    });
}

async function crawlAvito(task1Collection) {
    let metroSets = [
        {pmin: 0, pmax: 50},
        {pmin: 51, pmax: 200},
        {pmin: 201, pmax: 800},
        {pmin: 801, pmax: 2500},
        {pmin: 2501, pmax: 10000},
        {pmin: 10001}
    ];

    let totalPageCount = 0;

    while(true) {
        for (let metroSet of metroSets) {
            console.log(`pmin: ${metroSet.pmin} pmax: ${metroSet.pmax}`);

            let p = 1, pageCount = 0;
            while(true) {
                try {
                    let response = await request({
                        uri: (metroSet.pmax ?
                            `https://www.avito.ru/moskva/kollektsionirovanie/monety?p=${p}&view=list&pmin=${metroSet.pmin}&pmax=${metroSet.pmax}` :
                            `https://www.avito.ru/moskva/kollektsionirovanie/monety?p=${p}&view=list&pmin=${metroSet.pmin}`),
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
                        const $ = cheerio.load(response.body);
                        await grepData($, task1Collection);
                        pageCount = getActualPageCountFromCurrentPage($);
                        console.log(p, pageCount);
                        if (pageCount === undefined) {
                            // we are on the last page
                            totalPageCount += p;
                            break;
                        } else {
                            assert(p < pageCount);
                            p++;
                        }
                    } else {
                        console.log(`FAIL: `);
                        process.exit(0);
                    }
                } catch (exception) {
                    console.log(`Caught exception: ${exception}. Waiting...`);
                    await mySetTimeout();
                }
            }

            console.log(`totalPageCount: ${totalPageCount}`);
        }
    }
}

function getActualPageCountFromCurrentPage($) {
    let href = $(_.last($('.pagination-pages').children().toArray())).attr('href');

    if (href) {
        let pageCount = parseInt(href.match(/p=(\d*)/)[1]);
        assert(pageCount <= AVITO_MAX_PAGE_CRAWL_ALLOWED, `Avito does not allow navigate to more then ${AVITO_MAX_PAGE_CRAWL_ALLOWED} page. Change your filters`);
        return pageCount;
    }

    // Undefined href means that the current page is the last page
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
