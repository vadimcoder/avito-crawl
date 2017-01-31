const assert = require('assert');


function some() {
    return new Promise(function(resolve, reject) {
        setTimeout(() => {
            resolve(123);
        }, 1000);

    });
}

async function foo() {
    let promise = await some();
    console.log(promise);
    return 555;
}

// console.log(foo());

async function ggg() {
    let res = await foo();
    console.log(res);
}


async function bar () {
    for (let item of [1, 2, 3]) {
        await ggg();
    }

}




// foo().then(function(res) {
//     console.log(res);
// });

// (async () => {
//     try {
//         await ggg();
//     } catch (err) {
//         console.log(`err: ${err}`);
//     }
//
//
// })();

bar();



