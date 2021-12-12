import {CrawlAction, CrawlResult, ScrapeResult} from "../common";
import * as fs from 'fs-extra';
import * as path from 'path';
import * as playwright from 'playwright';
import {BrowserContext, Page} from 'playwright';
import {EncodeTools} from '@etomon/encode-tools';
import {initDatabase} from '../database';
import {SerializationFormat} from "@etomon/encode-tools/lib/EncodeTools";
import {extract} from 'article-parser'
import {getConfig} from "../config";

export abstract class CrawlerBase {
    constructor(protected ctx: BrowserContext) {

    }
    async login(link?: string[]): Promise<BrowserContext> {
        const { redisCache, db } = await initDatabase();
        const rawCookies = await db.collection('cookies').find({
            /*'cookie.domain': {
                $in: [ ].concat(link || []).map(l => require('url').parse(l).hostname as string)
            }*/
        }).toArray();

        const cookies = rawCookies.map(c => ({
            name: c.cookie.name,
            value: c.cookie.value,
            path: c.cookie.path,
            domain: c.cookie.domain,
            secure: !!(c.cookie.Secure || c.cookie.secure),
            expires: Math.round(((new Date()).getTime()/1e3)+(60*60*24*30))
        }));
        await this.ctx.addCookies(cookies);
        return this.ctx;
    }
    static async transferCookies(): Promise<void> {
        const { redisCache, db } = await initDatabase();
        const chrome = require('@znetstar/chrome-cookies-secure');
        const config = await getConfig();

        const cookies: any = await new Promise((resolve, reject) => {
            chrome.getCookies('puppeteer', (err: any, cookies: any) => {
                if (err) reject(err);
                else resolve(cookies);
            });
        });

        for (let cookie of cookies) {
            let cookieStore = {
                key: cookie.name,
                cookie,
                name: config.cookies?.name as string,
                profile: config.cookies?.profile
            }

            await db.collection('cookies').updateOne({ key: cookie.name }, {
                $set: cookieStore
            }, {
                upsert: true
            });
        }

    }


    get name(): string {
        // @ts-ignore
        return this.__proto__.constructor.name;
    }

    async scrape(link: string): Promise<ScrapeResult|null> {
        // if (await CrawlerBase.hexists(link, CrawlAction.scrape))  {
        //     return null;
        // }
        // await CrawlerBase.hset(link, CrawlAction.scrape, true);
        const { redisCache } = await initDatabase();
        const page = await this.ctx.newPage();

        let E: any
        let result: any = null;
        try {
            await page.goto(link);

            await new Promise<void>((resolve, reject) => setTimeout(() => resolve(), 5e3));

            const {isCovid} = await this.isCovid(page);

            if (!isCovid) return null;

            const html = await page.content();

            const articleData = await extract(html);
            result = {
                html,
                url: link,
                data: articleData,
                name: this.name
            };
        } catch (err) {  E =  err; }  finally {
            await page.close();
            if (E) throw E;
            return result;
        }
    }

    public static async hset(link: string, action: CrawlAction, value: unknown, key: string = 'links'): Promise<void> {
        const { redisCache } =  await initDatabase();

        await redisCache.hsetBuffer(key, `${link}:${action}`, EncodeTools.WithDefaults.serializeObject(value, SerializationFormat.msgpack));
    }

    public static async hget(link: string, action: CrawlAction,  key: string = 'links'): Promise<unknown> {
        const { redisCache } =  await initDatabase();
        const buf = await redisCache.hgetBuffer(`${link}:${action}`, link);



        return EncodeTools.WithDefaults.deserializeObject(buf, SerializationFormat.msgpack)
    }

    public static async hexists(link: string, action: CrawlAction, key: string = 'links'): Promise<boolean> {
        const { redisCache } =  await initDatabase();
        return !!(await redisCache.hexists(key, `${link}:${action}`));
    }
    public static async injectLodash(page: playwright.Page): Promise<void>  {
        const jq = await fs.readFile(path.join(__dirname, '..', '..', 'node_modules', 'lodash', 'lodash.js'), 'utf8');
        await page.addScriptTag({
            content: jq
        });
    }
    public static async injectJquery(page: playwright.Page): Promise<void>  {
        const jq = await fs.readFile(path.join(__dirname, '..', '..', 'node_modules', 'jquery', 'dist', 'jquery.js'), 'utf8');
        await page.addScriptTag({
            content: jq
        });
    }
    
    protected abstract isCovid(page: Page): Promise<{ isCovid: boolean, links: string[] }>;
    
    protected async* emitLinks(opts: Partial<{ link: string, links: string[] }>): AsyncGenerator<CrawlResult> {
        const { redisCache, db } =  await initDatabase();
        const  {  link, links } = opts;
        let covidInUrl = (url: string) =>  [
            'covid-19',
            'coronavirus',
            'omicron'
        ].map(x => url.toLowerCase().includes(x)).includes(true);

        for (const url of (links || [])) {
            if (!(await CrawlerBase.hexists(url, CrawlAction.crawl))) {
                await CrawlerBase.hset(url, CrawlAction.crawl, true);
                yield { url, action: CrawlAction.crawl, priority: covidInUrl(url) ? 1 : 0 };
            }
        }

        if (opts.link && !(await db.collection('articles').findOne({ url: opts.link }))) {
            await CrawlerBase.hset(opts.link, CrawlAction.scrape, true);
            yield { url: opts.link, action: CrawlAction.scrape, priority: covidInUrl(opts.link) ? 1 : 0 };
        }
    }

    async* crawl(link: string): AsyncGenerator<CrawlResult> {
        const { redisCache } = await initDatabase();

        await this.login();

        const page = await this.ctx.newPage();
        let E: any;
        try {
            await page.goto(link);

            await CrawlerBase.injectJquery(page);
            await new Promise<void>((resolve, reject) => setTimeout(() => resolve(), 5e3));

            const {isCovid, links}: { isCovid: boolean, links: string[] } = await this.isCovid(page);

            if (isCovid) {
                console.log(`💻 ${links.length} links found on ${link}`);
                for await (const result of this.emitLinks({links, link}))
                    yield result;
            }
        }
        catch (err) {
            E = err;
        } finally {
            await page.close();
            if (E) throw E;
        }
    }
}