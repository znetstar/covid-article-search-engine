import { Component, Fragment } from 'react'
import Head from 'next/head'
import Image from 'next/image'
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import SearchIcon from '@mui/icons-material/Search';
import {NextRouter, withRouter} from "next/router";

export type HomeState = {
    query?: string;
}

export type HomeProps = {
    router: NextRouter
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

export default withRouter(Home);
