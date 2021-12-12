import * as fs from  'fs-extra';
import {Config} from "./common";

import * as _ from 'lodash';
import {LaunchOptions} from "playwright";

export const RPC_PORT =  Number(process.env.PORT) || 3000;

export async function getConfig(): Promise<Config> {
    require('dotenv').config();

    let cfg: Partial<Config> = {};
    if (process.env.CONFIG_URI) {
        cfg = await fs.readJSON(process.env.CONFIG_URI);
    }

    return _.extend({
        rubric: {
          marker: 0.5,
          covidInBody: (0.05),
          covidInTitle: 0.2,
          covidInUrl: 0.2
        },
        forceSeed: !!process.env.FORCE_SEED,
        mongoUri: process.env.MONGO_URI ||  'mongodb://localhost:27017/covid-article-crawler',
        redisMqUri: process.env.REDIS_MQ_URI || process.env.REDIS_URI ||  'redis://localhost:6379/0',
        redisCacheUri: process.env.REDIS_CACHE_URI || process.env.REDIS_URI ||  'redis://localhost:6379/1',
        playwrightConfig: {
            headless: true
        } as LaunchOptions,
        cookies: {
            name: process.env.COOKIES_NAME  || 'default',
            profile: process.env.COOKIES_PROFILE
        },
        transferCookies: !!process.env.TRANSFER_COOKIES,
        rpcPort: RPC_PORT,
        functions: {
            rpc: !process.env.DISABLE_RPC,
            scraper: !process.env.DISABLE_SCRAPER,
            crawler: !process.env.DISABLE_CRAWLER,
            tokenizer: !process.env.DISABLE_TOKENIZER,
            indexer: !process.env.DISABLE_INDEXER
        }
    } as Config, cfg) as Config;
}