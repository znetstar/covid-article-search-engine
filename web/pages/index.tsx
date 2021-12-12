import { Component, Fragment } from 'react'
import Head from 'next/head'
import Image from 'next/image'
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import SearchIcon from '@mui/icons-material/Search';
import {NextRouter, withRouter} from "next/router";
import fetch from "node-fetch";
import {EncodeTools} from "@etomon/encode-tools";
import {IDFormat} from "@etomon/encode-tools/lib/EncodeTools";

export type HomeState = {
    query?: string;
}

export type HomeProps = {
    router: NextRouter,
    numDocs: number;
}

export class Home extends Component<HomeProps, HomeState> {
    state = { query: '' }
  render() {
    return (
        <Fragment>
            <Head>
                <title>COVID-19 Article Search Engine</title>
            </Head>
            <div id={"main"}>
                <div id={"header"}>
                    <h1>COVID-19 Article Search Engine</h1>
                    <h2>Search across {this.props.numDocs} articles!</h2>
                    <div><a href={'https://zb.gy/gh/covid-article-search-engine'} target={"_blank"} rel="noreferrer">See source on GitHub</a></div>
                    <br/>
                </div>
                <div id={"box"}>
                    <TextField onChange={(e) => this.setState({ query: e.target.value })}
                               variant="outlined"
                               size="small"
                               onKeyPress={
                                   (e) => {
                                       if (e.which === 13) {
                                           this.props.router.push('/results?query='+this.state.query);
                                           e.preventDefault();
                                       }
                                   }
                               }
                    />
                    <Button
                        onClick={() => { this.props.router.push('/results?query='+this.state.query); }}
                        variant="contained"
                        startIcon={<SearchIcon />}>Search</Button>
                </div>
            </div>
        </Fragment>
    )
  }
}


export async function getServerSideProps(context: any) {
  const query  = decodeURIComponent(context.req.url.indexOf('query=') !== -1 ? context.req.url.split('?query=').pop().split('&').shift() : '').replace(/\+/g, ' ').replace(/\%20/g, ' ');
  const body: { result: number } = await (await fetch(process.env.ENGINE_URI as string, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      method: 'numDocs',
      jsonrpc: '2.0',
      params: [ query ],
      id: Buffer.from(EncodeTools.WithDefaults.uniqueId(IDFormat.uuidv4)).toString('base64')
    })
  })).json() as { result: number };

  return {
    props: {
      numDocs: body.result
    }
  }
}


export default withRouter(Home);
