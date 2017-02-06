'use strict';

const mongo = require('mongodb');


async function sleep() {
    return new Promise((resolve) => {
        setTimeout(resolve, 1000);
    });
}

(async () => {
    const db = await mongo.connect('mongodb://localhost:27017/avito');
    const task2 = db.collection('task2');
    const task3 = db.collection('task3');

    // let res1 = await task2.insertOne({foo: 1});
    // let res2 = await task2.insertOne({foo: 2});
    // let res3 = await task3.insertOne({statusObject: res1.statusObject});

    // await task3.updateOne({}, {$set: {foo: 2}});


    console.log(typeof insertedId);





    let advertisement;
    while (true) {
        let cursor;
        const statusObject = await task3.findOne();

        if (statusObject === null) {
            // first run
            await task3.insertOne({insertedId: 0});
            cursor = await task2.find();
        } else if (statusObject.insertedId === 0) {
            cursor = await task2.find();
        } else {
            cursor = await task2.find({_id: {$gt: statusObject.insertedId}});
        }

        while ((advertisement = await cursor.next()) !== null) {
            console.log(advertisement);
            await sleep();
            await task3.updateOne({}, {$set: {insertedId: advertisement._id}});
        }

        await task3.updateOne({}, {$set: {insertedId: 0}});
    }


    // setTimeout(() => {
    //     res4.next().then(function (next) {
    //         console.log(next);
    //     });
    // }, 5000);
    //
    // setTimeout(() => {
    //     res4.next().then(function (next) {
    //         console.log(next);
    //     });
    // }, 10000);
    //
    // setTimeout(() => {
    //     res4.next().then(function (next) {
    //         console.log(next);
    //     });
    // }, 12000);
    //
    // setTimeout(() => {
    //     res4.next().then(function (next) {
    //         console.log(next);
    //     });
    // }, 15000);

    await db.close();

})();