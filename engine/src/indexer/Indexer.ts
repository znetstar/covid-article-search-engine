import {initDatabase} from "../database";
import {FinalSearchResult, IndexedScrapeResult, ScoredSearchResult, ScrapeResult, TfidfMapping} from "../common";
import {ObjectId} from "mongodb";
import {Queue} from "bullmq";
const stem = require( 'wink-porter2-stemmer' );

const winkNLP = require( 'wink-nlp' );
const its = require( 'wink-nlp/src/its.js' );
const as = require( 'wink-nlp/src/as.js' );
const model = require( 'wink-eng-lite-model' );
const nlp = winkNLP( model );

export async function generateExtraWeightCorpus() {
    const {
        db,
        redisCache
    } = await initDatabase();
    const nlp = winkNLP( model );
    await db.collection('corpus').deleteMany({ });
    let sourceDoc: any;
    let cur = db.collection('articles').find({ name: 'COVIDCorpus' });
    await redisCache.pipeline()
        .del('corpus:freq')
        .del('corpus:count')
        .exec();

    const termGrid = new Map<string, number>()

    while (sourceDoc = await cur.next()) {
        const text = sourceDoc.data.content;
        const doc = nlp.readDoc( text );

        const result = doc.tokens().filter((t: any) => {
            return !(t.out(its.stopWordFlag)) && (t.out(its.type) !== 'punctuation');
        }).out(  its.normal, as.freqTable ).map((s: [ string, number ]) => [stem(s[0]), s[1]]);

        const maxFij = result[0][1];

        for (let [ word, fij ] of result) {
            if (!Number.isNaN(Number(word)) || word.length === 1)  continue;
            const tfij = fij/maxFij;
            await redisCache.pipeline()
                .hincrby('corpus:freq', word, tfij)
                .hincrby('corpus:count', word, 1)
                .exec();
        }
    }

    const [freqHash, countHash] = await Promise.all([
        redisCache.hgetall('corpus:freq'),
        redisCache.hgetall('corpus:count')
    ]);
    for (let word in freqHash) {
        let freq = Number(freqHash[word]);
        const count = Number(countHash[word]);
        let avgWordFreq = freq/count;

        console.log(`corpus final`, `${word}-${Math.round(avgWordFreq*100)}`);

        await db.collection('corpus').insertOne({ word, freq:  avgWordFreq });
    }
}

function tokenizeText(text: string): [string,number][] {
    const doc = nlp.readDoc( text );

    const terms = doc.tokens().filter((t: any) => {
        return !(t.out(its.stopWordFlag)) && (t.out(its.type) !== 'punctuation');
    }).out(  its.normal, as.freqTable ).map((s: [ string, number ]) => [ stem(s[0]), s[1] ]) as  [ string, number ][];

    return terms;
}

export async function tokenizeDocument(sourceDoc: ScrapeResult): Promise<IndexedScrapeResult> {
    const {
        db,
        redisCache
    } = await initDatabase();
    const text = sourceDoc.data.content;

    const terms = tokenizeText(text);

    await db.collection('articles').updateOne(
        // @ts-ignore
        {  _id: new ObjectId(sourceDoc._id) },
        {
            $set: {
                terms_k: terms.map(t => t[0]),
                terms_v: terms.map(t => t[1])
            }
        }
    );

   return {
       ...sourceDoc,
       terms_k: terms.map(t => t[0]),
       terms_v: terms.map(t => t[1])
   };
}


export async function indexTextFull(arr: [ string, number ][]): Promise<[ string, TfidfMapping ][]> {
    const {
        db,
        redisCache
    } = await initDatabase();
    const maxFrequency = arr[0][1];

    const freqTable = new Map<string, number>(
        arr.map(([word, freq]) => {
            return [word, freq / maxFrequency]
        })
    );

    const numDocs = await db.collection('articles')
        .find().count();

    const tfIdfMap: any = [];
    for (const [word, tf] of Array.from(freqTable.entries())) {
        const numArticles = await db.collection('articles')
            .find({terms_k: {$in: [word]}}).count();

        const idf = Math.log(
            (numDocs / (numArticles || 1))
        ) / Math.log(2);

        const tfidf = tf * idf;
        tfIdfMap.push([ word, {  tf, idf, tfidf  } ]);
    }

    return tfIdfMap;
}

export async function indexTextAsMapping(arr: [ string, number ][]): Promise<{ k: string, v: TfidfMapping }[]> {
    let map: { k: string, v: TfidfMapping }[] = [];
    for (let val of (await  indexTextFull(arr)))  {
        map.push({ k: val[0], v: val[1] });
    }

    return map;
}

export async function indexText(arr: [ string, number ][]): Promise<[ string, number ][]> {
    return (await indexTextFull(arr)).map(t => [ t[0], t[1].tf*t[1].idf ]);
}


function mergeTerms(sourceDoc: IndexedScrapeResult): [string,number][] {
    return sourceDoc.terms_k.map((k,i) => [k, sourceDoc.terms_v[i]]);
}

let idfTimeout: any;

export async function rollIdf(indexQueue: Queue): Promise<void> {
  const {
    db,
    redisCache
  } = await initDatabase();
  const count = await indexQueue.getActiveCount();
  if (count) {
    console.log('skipping idf roll because active count');
    return;
  }

  const [[_1, term], [ _2, proceed ]] = await redisCache.pipeline()
    .rpop('idfQueue')
    .setnx('idfRoll', 1)
    .exec();

  if (!term || !proceed)  {
    if (!idfTimeout)
      idfTimeout = setTimeout(() => {
        idfTimeout = void(0);
        rollIdf(indexQueue).catch((err => console.warn(err.stack)))
      }, 30e3);
    return;
  }

  if (idfTimeout) {
    clearTimeout(idfTimeout);
    idfTimeout = void(0);
  }

  await redisCache.pexpire('idfRoll', 30e3);

  const [[_, idf]] = await redisCache.pipeline()
    .hget('idfTemp', term)
    .hdel('idfTemp', term).exec();

  if (idf) {
    await db.collection('articles').updateMany({
      // @ts-ignore
      [`tfidf.k`]: term
    }, {
      $set: {
        [`tfidf.$.v.idf`]: Number(idf)
      }
    });
  }

  await redisCache.del('idfRoll');


  return rollIdf(indexQueue);
}

type TFIDFResult = IndexedScrapeResult&{tfidf: { k:string, v: TfidfMapping }[] };
export async function indexDocument(inputDoc: ScrapeResult, indexerQueue?: Queue): Promise<TFIDFResult> {
    const {
        db,
        redisCache
    } = await initDatabase();

    const sourceDoc = await tokenizeDocument(inputDoc);
    const tfidf = await indexTextAsMapping(mergeTerms(sourceDoc));

    (sourceDoc as TFIDFResult).tfidf = tfidf;
    const  pipe = redisCache.pipeline();
    for (let t of tfidf) {
        pipe.hset('idfTemp', t.k, t.v.idf);
        pipe.lpush('idfQueue', t.k);
    }

    await pipe.exec();

  rollIdf(indexerQueue).catch(err => {
    console.warn(err.stack);
  });

    return sourceDoc as TFIDFResult;
}

async function getAllTerms(noCache: boolean = false): Promise<string[]> {
    const { redisCache, db } = await initDatabase();
    if (!noCache) {
        return redisCache.lrange('all-terms', 0, -1);
    }
    const termDoc = await db.collection('articles').aggregate([
        {
            $unwind: '$terms'
        },
        {
            $group: {
                _id: null,
                terms: { $addToSet: '$terms' }
            }
        }
    ]).next();

    const terms = termDoc?.terms;
    const pipeline = redisCache.pipeline();
    for (const term of (terms || [])) {
        pipeline.lpush(term);
    }

    await pipeline.exec();

    return terms;
}

export async function doSearch(input: string): Promise<FinalSearchResult[]> {
  try {
    const {redisCache, db} = await initDatabase();
    const terms = tokenizeText(input);

    const matches = db.collection('articles').aggregate([
      {
        $project: {
          html: 0,
          'data.content': 0
        }
      },
      {
        $sort: {
          terms_k: 1,
          name: 1
        }
      },
      {
        $match: {
          'terms_k': {$in: terms.map(t => t[0])},
          tfidf: {$exists: true}
        }
      },
      {
        $group: {
          _id: '$data.url',
          doc: {
            $max: '$$ROOT'
          }
        }
      },
      {
        $replaceRoot: {
          newRoot: '$doc'
        }
      },
      {
        $project: {
          // @ts-ignore
          data: 1,
          url: 1,
          score: 1,
          terms_k: 1,
          tfidf: 1,
          terms_v: 1
        }
      }
    ], {
      allowDiskUse: true
    });

    let match: ScoredSearchResult;
    const qTerms = await indexText(terms);

    let qLen: number = 0;
    for (const n of qTerms) qLen += n[1] ** 2;

    const results: ScoredSearchResult[] = [];
    let i = 0;
    while (match = (await matches.next() as unknown as ScoredSearchResult)) {
      const matchTerms = mergeTerms(match);
      const allTerms = Array.from((new Set(terms.map(t => t[0]).concat(matchTerms.map(t => t[0])))).values());
      let sim = 0;
      let docLen = 0;
      for (let term of allTerms) {
        if (matchTerms.map(x => x[0]).includes(term) && terms.map(x => x[0]).includes(term)) {
          let dTfidf = match.tfidf.find(x => x.k === term).v.tf * match.tfidf.find(x => x.k === term).v.idf;
          let qTfidf = qTerms.filter(t => t[0] === term)[0][1];

          sim += dTfidf * qTfidf;
          docLen += dTfidf ** 2;
        }
      }

      match.score = (sim / Math.sqrt(docLen + qLen));
      results.push(match);
      // if (i++ > 50)
      //   break;
    }


    return results.map((d): FinalSearchResult => {
      return {
        source: d.name,
        ...d.data,
        score: d.score,
        url: d.url
      }
    }).sort((a, b) => {
      return b.score - a.score;
    });
  } catch (err) {
    console.warn(err);
    throw err;
  }
}
