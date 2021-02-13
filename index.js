const fs = require('fs');
const cheerio = require('cheerio');
const got = require('got');
const { resolve } = require('path');
const { rejects } = require('assert');
const storage = require('node-persist');
const Product = require('./product.js')
const { Console } = require('console');

const baseUrl = 'https://www.ebucks.com';
const shopUrl = '/web/shop/shopHome.do';

let pages = new Set();
let discountProducts = new Map();
let myStorage;

//obtain list of top level categories
function getLinks(url, lvl) {
    console.log("Retrieving level " + lvl + " links @: " + url);
    
    return new Promise( (resolve, reject) => {

        got(url).then(response => {
            const $ = cheerio.load(response.body);
                  
            $("li[id^='catMenu']")
            .map((i, node) => {
                let ref = node.children[1].attribs.href;
                pages.add( removeSessionId(ref) );
                console.log(node.children[1].children[0].data);
                //console.log(" ");
            })
    
            resolve(lvl + " level links done.");
            
        }).catch(err => {
            console.log(err);
            reject(err)
        });
    })
}

function getCategoryboxLink(url, lvl) {
    
    return new Promise( (resolve, reject) => {
        
        got(url).then(response => {
            console.log("Retrieving level " + lvl + " links @: " + url);
            const $ = cheerio.load(response.body);
            //#shopContent > div > div:nth-child(1) > div.categorybox-link
            $(".categorybox-frame > .categorybox-link")
            .map((i, node) => {
                let ref = node.children[1].attribs.href;
                pages.add( removeSessionId(ref) );
            })
    
            resolve(lvl + " level links done.");
            
        }).catch(err => {
            console.log(err);
            reject(err)
        });
    })
}

function getDiscountProductsOnPage(url) {
    return new Promise( (resolve, reject) => {

        got(url).then(response => {
            //console.log("Looking for discounts on " + url);
            const $ = cheerio.load(response.body);
            $(".discount-product")
            .map((i, node) => {
                let name = $(".productbox-name",node).text();
                let price = $(".productbox-price > div.rand-price > span", node).text();
                //#shopContent > div > div:nth-child(19) > div.productbox-link > a
                let a = $(".productbox-link > a", node);
                //console.log(a.attr().href);
                let url = a.attr().href;
                //console.log($(".productbox-link > a", node));

                //console.log("R " + price + " for " + name + " @ " + baseUrl + url);
                let p = new Product(name,price,url,$(this).html());
                discountProducts.set(name, p);
                //#shopContent > div > div:nth-child(19) > div.productbox-price > div.rand-price > span
                //console.log(node);
                // console.log(i + " Found a discount @ " + url);
                // console.log($.html(node));
            })

            resolve("Discounted products logged");
            
        }).catch(err => {
            console.log(err);
            reject(err)
        });
    })
}

function removeSessionId(str) {
    return str.replace(/;jsessionid=[\w\d]+/g,"")
}  

async function isNew(key, storage) {
    let found = await storage.getItem(key);
    if (found) 
        return true 
    else
        return false;
}

async function persistProducts(discountProducts, myStorage) {
    //first of all, lets set all persisted objects to *Expired*
    await myStorage.forEach(async datum => {
        console.log("Expiring entry: " + datum.key);
        datum.value.isExpired = true;
        await myStorage.setItem(datum.key, datum.value);
    })
    
    for (let [key, obj] of discountProducts) {
        if (isNew(key,myStorage)) obj.isNew = true;
        await myStorage.setItem(key, obj);
        console.log("Added item: " + key + " to persistant storage");
    }
}



async function start() {
    console.log("Initialising storage.");
    myStorage = storage.create({
        dir: 'storage',
        stringify: JSON.stringify,
        parse: JSON.parse,
        encoding: 'utf8',
        logging: false,  // can also be custom logging function
        ttl: false, // ttl* [NEW], can be true for 24h default or a number in MILLISECONDS or a valid Javascript Date object
        expiredInterval: 2 * 60 * 1000, // every 2 minutes the process will clean-up the expired cache
        // in some cases, you (or some other service) might add non-valid storage files to your
        // storage dir, i.e. Google Drive, make this true if you'd like to ignore these files and not throw an error
        forgiveParseErrors: true
    });
    return myStorage.init();
 }

//initialisation.
start()
//Retrieve top level links
.then(msg => {
    return getLinks(baseUrl+shopUrl, 1)    
})
//retrieve second level links
.then(msg => {
    console.log(msg);
    let promises = new Array();
    pages.forEach(element => {
        promises.push(getLinks(baseUrl+element,2));
    });
    return Promise.all(promises);
})
//sometimes we have another level that is not on the list menu, retrieve those pages
.then(values => {
    let promises = new Array();
    pages.forEach(element => {
        promises.push(getCategoryboxLink(baseUrl+element,3));
    });
    return Promise.all(promises);
})
//finally, we can follow these links and look for products that are on sale
.then(values => {
    let promises = new Array();
    pages.forEach(element => {
        promises.push(getDiscountProductsOnPage(baseUrl+element));
    })
    return Promise.all(promises);
})
//Now persist the data in the map for future reference.
.then(values => {
    console.log("Found " + discountProducts.size + " discounted products");
    for (let [key, obj] of discountProducts) {
        console.log("R " + obj.price + " " + obj.name + " @ " + baseUrl + obj.url);
    }

    persistProducts(discountProducts, myStorage);
});

