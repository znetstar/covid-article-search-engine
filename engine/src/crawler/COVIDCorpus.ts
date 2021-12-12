import {CrawlerBase} from "./CrawlerBase";
import {CrawlAction, CrawlResult, ScrapeResult} from "../common";
import {initDatabase} from "../database";
import {extract} from "article-parser";

export class COVIDCorpus extends CrawlerBase {
    protected isCovid(page: any): Promise<{ isCovid: boolean; links: string[] }> {
        return Promise.resolve(undefined);
    }

    async scrape(link: string): Promise<ScrapeResult|null> {
        const {
            db
        } = await initDatabase();
        const page = await this.ctx.newPage();
        let E: any;
        let result: any = null;
        try {
            await page.goto(link.replace('https://www.paho.orghttps://www.paho.org', 'https://www.paho.org'));
            await new Promise<void>((resolve, reject) => setTimeout(() => resolve(), 1e3));
            const html = await page.content();

            const articleData = await extract(html);
            result = {
                html,
                url: link,
                data: articleData,
                name: this.name
            };

            return result;
        } catch (err) {
            E = err;
        } finally {
            await page.close();
            if (E) throw E;
            return result;
        }
    }

    async* crawl(link: string): AsyncGenerator<CrawlResult> {
        const {redisCache, db} = await initDatabase();

        const page = await this.ctx.newPage();
        let E: any;
        try {
            await page.goto(link.replace('https://www.paho.orghttps://www.paho.org', 'https//www.paho.org'));
            await CrawlerBase.injectJquery(page);
            await new Promise<void>((resolve, reject) => setTimeout(() => resolve(), 5e3));
            const arr = await page.evaluate(() => {
                const crawlLinks = Array.from($('[href*="/journal/en/articles"]')).map(function (e) {
                    return ('https://www.paho.org' + $(e).attr('href')).replace('https://www.paho.orghttps://www.paho.org', 'https//www.paho.org');
                }) as unknown as string[];
                ;

                // const scrapeLinks = Array.from($('[href*="https://doi.org]')).map(function (e) {
                //     return $(e).attr('href');
                // }) as unknown as string[];

                // console.log(scrapeLinks);

                return [crawlLinks, crawlLinks];
            }) as [string[], string[]];


            const  [crawlLinks, scrapeLinks]: [string[], string[]] = arr;

            for (const url of scrapeLinks) {
                if (!await db.collection('articles').findOne({url}))
                    yield {url, action: CrawlAction.scrape, priority: 0};
            }
            for (const url of crawlLinks) {
                if (!await CrawlerBase.hexists(url, CrawlAction.crawl))
                    yield {url, action: CrawlAction.crawl, priority: 0};
            }
        } catch (err) { E  = err; } finally {
            await page.close();

            if (E) throw E;
        }
    }
    get name() { return 'COVIDCorpus'; }
}

export default COVIDCorpus;