import {Db, MongoClient} from "mongodb";
import {Redis} from "ioredis";
import *  as playwright from 'playwright';
import { LaunchOptions } from "playwright";
import { getConfig } from "./config";
import {ArticleData} from "article-parser";

export enum CrawlAction {
    crawl,
    scrape
}

export type CrawlResultMatchingFactor  =  'marker'|'covidInTitle'|'covidInBody'|'covidInUrl';

export interface CrawlResult {
    url: string;
    action: CrawlAction,
    priority: number
}

export interface ScrapeResult {
    url: string;
    html: string;
    data: ArticleData;
    name: string;
}

export type IndexedScrapeResult = ScrapeResult&{
    terms_k: string[],
    terms_v: number[]
}

export interface Config {
    mongoUri: string;
    redisMqUri: string;
    redisCacheUri: string;
    playwrightConfig?: LaunchOptions;
    transferCookies?: boolean;
    forceSeed?: boolean;
    cookies?: { profile?: string, name: string }
    rubric: {
        marker: number;
        covidInTitle: number;
        covidInBody: number;
        covidInUrl: number;
    },
    rpcPort: number;
    functions: {
        rpc: boolean;
        scraper: boolean;
        crawler: boolean;
        tokenizer: boolean;
        indexer:  boolean;
    }
}

export interface DatabaseDelta {
    mongo: MongoClient,
    redisMq: Redis,
    redisCache: Redis,
    db: Db;
}

export type IAppGlobal = {
    databases: DatabaseDelta;
}

export async function initPlaywright(): Promise<playwright.Browser> {
    const browser  = (global as any).browser = (global as any).browser || await playwright.chromium.launch((await getConfig()).playwrightConfig) as playwright.Browser;
    return browser;
}

export const globalObj: IAppGlobal = global as unknown as IAppGlobal;

export class CrawlerOrScraperDoesNotExistError extends Error {
    constructor(public name: string) { super(`Crawler or scraper "${name}" does not exist`); }
}
export type TfidfMapping = { tf: number, idf: number, tfidf?: number };
export type ScoredSearchResult = (IndexedScrapeResult&{  tfidf: { k:string, v: TfidfMapping }[], score: number });

export type FinalSearchResult = ArticleData&{
    url: string;

    score: number;
}