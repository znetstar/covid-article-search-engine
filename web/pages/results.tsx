import { Component, Fragment } from 'react'
import Head from 'next/head'
import Image from 'next/image'
import { withRouter, NextRouter } from 'next/router'
import fetch from 'node-fetch';
import {
    EncodeTools
} from '@etomon/encode-tools';
import { IDFormat } from '@etomon/encode-tools/lib/EncodeTools';
import Button from "@mui/material/Button";
import SearchIcon from "@mui/icons-material/Search";

export type ResultsState = {
}

export type ResultsProps = {

    query?: string;
    results: Result[];
    router: NextRouter
}

interface Result {
    "url" : string,
    "title" : string,
    "description" : string,
    "links" :string[],
    "image" : string,
    "content" : string,
    "author": string,
    "source" : string,
    "published" : string,
    score: number,
    "ttr" : number
}

export class Results extends Component<ResultsProps,ResultsState> {
    state = {
        results: []
    } as ResultsState
    async loadResults() {

    }

    render() {
        if (!this.props.router.query) {
            this.props.router.push('/');
            return;
        }
        return (
            <Fragment>
                <Head>
                    <title>COVID-19 Article Search Engine</title>
                </Head>
                <div>
                <div>
                    <h1>COVID-19 Search Engine</h1>
                </div>

                <div>
                    <h2>Results for &quot;{this.props.query}&quot;</h2>
                    <div>
                        <Button
                            onClick={() => { this.props.router.push('/'); }}
                            variant="contained">Back</Button>
                    </div>
                    <ul>
                        {
                            this.props.results.map((r, i) => {
                                return (
                                    <li key={i}><a target={"_blank"} rel="noreferrer" href={r.url}>[{r.source}]: {r.title} (score: {r.score})</a></li>
                                )
                            })
                        }
                    </ul>
                </div>
            </div>
            </Fragment>
        )
    }
}

export default withRouter(Results);

export async function getServerSideProps(context: any) {
    const query  = decodeURIComponent(context.req.url.indexOf('query=') !== -1 ? context.req.url.split('?query=').pop().split('&').shift() : '');
    const body: { result: Result[] } = await (await fetch(process.env.ENGINE_URI as string, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            method: 'doSearch',
            jsonrpc: '2.0',
            params: [ query ],
            id: Buffer.from(EncodeTools.WithDefaults.uniqueId(IDFormat.uuidv4)).toString('base64')
        })
    })).json() as { result: Result[] };

    return {
        props: {
            query,
            results: body.result
        }
    }
}