import {CrawlAction, DatabaseDelta, globalObj} from "./common";
import {MongoClient} from 'mongodb';
import {Redis} from 'ioredis';
import {getConfig} from "./config";
import {EncodeTools} from "@etomon/encode-tools";
import {SerializationFormat} from "@etomon/encode-tools/lib/EncodeTools";


export async function initDatabase(): Promise<DatabaseDelta> {
    if ((globalObj).databases) return (globalObj).databases;

    const mongo = await MongoClient.connect((await getConfig()).mongoUri);
    const redisMq: Redis = new (require('ioredis'))((await getConfig()).redisMqUri) as unknown as Redis;
    const redisCache: Redis = new (require('ioredis'))((await getConfig()).redisCacheUri) as unknown as Redis;

    const dbDelta: DatabaseDelta = {
        mongo,
        redisMq,
        redisCache,
        db: mongo.db(require('url').parse((await getConfig()).mongoUri).pathname.substr(1))
    }

    await dbDelta.db.collection('articles').createIndex({ url: 1 }, { unique: true });
    // await dbDelta.db.collection('articles').createIndex({ 'data.url': 1 }, { unique: true });
    await dbDelta.db.collection('articles').createIndex({ tfidf: -1 }, {});
    await dbDelta.db.collection('articles').createIndex({ terms_k: 1 }, {});

    let count: number = 1e3;
    //  @ts-ignore
    const cur = await dbDelta.db.collection('articles').find({}, { projection: { url: 1, _id: 0  }, batchSize: count });
    let rec: any;
    let i: any = 0;
    let pipeline: any;
    while (rec = await cur.next())
    {
        if (!pipeline) {
            pipeline = redisCache.pipeline();
        }
        pipeline.hsetBuffer('links', `${rec.url}:1`, EncodeTools.WithDefaults.serializeObject(true, SerializationFormat.msgpack));

        if (i > count) {
            await pipeline.exec();
            pipeline = void(0);
        }
    }

    if (pipeline)
        await pipeline.exec();


    globalObj.databases = dbDelta;
    return dbDelta;
}