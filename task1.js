'use strict';

const request = require('request-promise-native');
const mongo = require('mongodb');

const constants = require('./common').constants;
const SUCCESSFUL_EXIT_CODE = 0;

let DB;

async function connect() {
    return mongo.connect(constants.CONNECTION_STRING);
}

let reg = '';

for (let year = 1000; year <= 2017; ++year) {
    reg += year;
    if (year !== 2017) {
        reg += '|';
    }
}

let hasYears = 0;
let issuedBefore2000 = 0;

function count(item) {
    let itemText = item.title;

    if (item.advertisementBody) {
        itemText += item.advertisementBody;
    }

    const res = (new RegExp(reg)).exec(itemText);

    if (res) {
        hasYears++;

        if (res[0] < 2000) {
            issuedBefore2000++;
        }
        
    } else if (/[\d]{2,3}[\s]*-[\s]*[\d]{2,3}[\s]*\u0433/.test(itemText)) {
        hasYears++;
        issuedBefore2000++;
    }
}

async function main(db) {
    const task1Collection = db.collection(constants.MAIN_COLLECTION_NAME);
    const cursor = await task1Collection.find({is_expired: false});

    let item;
    while ((item = await cursor.next()) !== null) {
        count(item);
    }

    const totalCount = await task1Collection.find({is_expired: false}).count();

    console.log(`totalCount: ${totalCount}`);
    console.log(`hasYears: ${hasYears}`);
    console.log(`hasNoYears: ${totalCount - hasYears}`);
    console.log(`issuedBefore2000: ${issuedBefore2000}`);
    const issuedAfter2000 = hasYears - issuedBefore2000;
    console.log(`issuedAfter2000/: ${issuedAfter2000}`);
    console.log(`issuedBefore2000/issuedAfter2000: ${issuedBefore2000/issuedAfter2000}`);
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
        await DB.close();
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
