import {Queue, QueueScheduler, Worker} from 'bullmq';
import {initDatabase} from './database';
import {CrawlerBase} from "./crawler/CrawlerBase";
import * as path from 'path';
import * as fs from 'fs';
import {CrawlAction, CrawlerOrScraperDoesNotExistError, initPlaywright, ScrapeResult} from "./common";
import {getConfig, RPC_PORT} from "./config";
import {doSearch, indexDocument, tokenizeDocument} from "./indexer/Indexer";
import {ObjectId} from "mongodb";
import {JSONSerializer, HTTPTransport, Server as RPCServer} from 'multi-rpc';
import {SerializationFormat} from "@etomon/encode-tools/lib/EncodeTools";

const cheerio =  require('cheerio');

const rpcServer = new RPCServer(
     new HTTPTransport(new JSONSerializer(),  RPC_PORT)
);


export async function initControl()  {
    const { redisMq: connection, db } = await initDatabase();
    const config  = await getConfig();

    const crawlerQueue = new Queue('crawl', {
        connection,
        defaultJobOptions: {
            delay: 5e3,
            removeOnComplete: true,
            removeOnFail: true
        }
    });
    const scraperQueue = new Queue('scraper',  {
        connection,
        defaultJobOptions: {
            delay: 5e3,
            removeOnComplete: true,
            removeOnFail: 5
        }
    });
    const tokenizeQueue = new Queue('tokenize',  {
        connection,
        defaultJobOptions: {
            delay: 5e3,
            removeOnComplete: true,
            removeOnFail: 5
        }
    });
    const indexerQueue = new Queue('indexer',  {
        connection,
        defaultJobOptions: {
            delay: 5e3,
            removeOnComplete: true,
            removeOnFail: 5
        }
    });
    const crawlerQueueSch = new QueueScheduler('crawl', { connection });
    const scraperQueueSch = new QueueScheduler('scraper', { connection });
    const tokenizeQueueSch = new QueueScheduler('tokenize', { connection });
    const indexQueueSch = new QueueScheduler('indexer', { connection });

    if ((config).transferCookies)
        await CrawlerBase.transferCookies();


    const context = await (await initPlaywright()).newContext();

    if (config.functions.tokenizer) {
        console.log('starting tokenizer');
        const tokenize = new Worker('tokenize', async job => {
            try {
               const doc = await db.collection('articles').findOne({  _id: new ObjectId(job.data.id) });
               if (!doc)  return;
               const updatedDoc = await tokenizeDocument(doc as unknown as ScrapeResult);


            } catch (err) {
                console.log(err);
                throw err;
            }
        }, {
            connection,
            // limiter: {
            //     max: 50,
            //     duration: 60e3 * 10
            // }
        });
    }

    if (config.functions.indexer) {
        console.log('starting indexer');
        const indexer = new Worker('indexer', async job => {
            try {
                const doc = await db.collection('articles').findOne({ _id: new ObjectId(job.data.id) });
                if (!doc)  return;
                const updatedDoc = await indexDocument(doc as unknown as ScrapeResult);

                console.log('index '+updatedDoc.url);
                await db.collection('articles').updateOne(
                    {  _id: new ObjectId(job.data.id) },
                    {
                        $set: {
                            tfidf: updatedDoc.tfidf
                        }
                    }
                );
            } catch (err) {
                console.log(err);
                throw err;
            }
        }, {
            connection,
            // limiter: {
            //     max: 50,
            //     duration: 60e3 * 10
            // }
        });
    }

    if (config.functions.crawler) {
        console.log('starting crawler');
        const crawl = new Worker('crawl', async job => {
            try {
                const p = path.join(__dirname, 'crawler', `${job.name}`);
                // if (!fs.existsSync(p))
                //     throw new CrawlerOrScraperDoesNotExistError(job.name);

                const Crawler: any = (await import(p)).default;
                const crawler: CrawlerBase = new Crawler(context);
                for await (const result of crawler.crawl(job.data.url)) {
                    console.log('crawl', result.url);
                    let priority: number = 0;
                    priority = result.priority * -1;
                    if (result.action === CrawlAction.scrape) {
                        await scraperQueue.add(job.name, result, {priority});
                    } else if (result.action === CrawlAction.crawl) {
                        await crawlerQueue.add(job.name, result, {priority});
                    }
                }

            } catch (err) {
                console.log(err);
                throw err;
            }
        }, {
            connection,
            // limiter: {
            //     max: 50,
            //     duration: 60e3 * 10
            // }
        });
    }
    if (config.functions.scraper) {
        console.log('starting scraper');
        const scrape = new Worker('scraper', async job => {
            try {
                const p = path.join(__dirname, 'crawler', `${job.name}`);
                // if (!fs.existsSync(p))
                //     throw new CrawlerOrScraperDoesNotExistError(job.name);

                const Crawler: any = (await import(p)).default;
                const crawler: CrawlerBase = new Crawler(context);

                const result = await crawler.scrape(job.data.url);
                if (!result || !result.data) {
                    return;
                }

                console.log('scrape', result.data.url);


                result.data.content = cheerio.load(result.data.content).text();


                const insertResult = await db.collection('articles').insertOne({...result, createdAt: new Date(), updatedAt: new Date()});

                await indexerQueue.add('indexer',{ id: insertResult.insertedId });
            } catch (err: any) {
                console.warn(err.stack);
            }
        }, {
            connection,
            // limiter: {
            //     max: 50,
            //     duration: 60e3 * 10
            // }
        });
    }

    const dbCount = await db.collection('articles').find({}).count();

    if (!dbCount) {
        await crawlerQueue.add('Economist',{ url: 'https://www.economist.com/science-and-technology/2021/11/28/what-to-do-about-covid-19s-threatening-new-variant' }, { priority: 0 });
        await crawlerQueue.add('WSJ',{ url: 'https://www.wsj.com/articles/as-omicron-threat-looms-delta-variant-pushes-covid-19-cases-higher-11638633600' }, { priority: 0 });
        await crawlerQueue.add('NYTimes',{ url: 'https://www.nytimes.com/2021/12/03/us/coronavirus-omicron-sequencing.html' }, { priority: 0 });
        // await crawlerQueue.add('COVIDCorpus', { url: 'https://www.paho.org/journal/en/special-issues/scientific-papers-and-resources-covid-19' });
    }
    else {
        let needsIndex: any;
        let cur: any = db.collection('articles').find({
            tfidf: {$exists: false}
        });
        while (needsIndex = await cur.next()) {
            await indexerQueue.add('indexer', {id: needsIndex._id});
        }
    }

     if (config.functions.rpc) {
        await rpcServer.listen();
        console.info(`rpc listening on port ${RPC_PORT}`);
        rpcServer.methods.doSearch = doSearch;
    }
}