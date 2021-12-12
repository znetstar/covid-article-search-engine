import {CrawlerBase} from "./CrawlerBase";
import {ScrapeResult} from "../common";
import {Page} from "playwright";
import * as _ from 'lodash';

export class EconomistCrawler extends CrawlerBase {
    async scrape(link: string): Promise<ScrapeResult> {
        await this.login();

        return super.scrape(link);
    }
    async isCovid(page: Page) {
        await CrawlerBase.injectJquery(page);
        await CrawlerBase.injectLodash(page);
        const result: { isCovid: boolean, links: string[] } = await page.evaluate(async () => {
            const links = _.flatten([
                'covid-19',
                'coronavirus',
                'omicron'
            ].map((r) => [ '.article__description', '.article__headline', '.article__subheadline' ].map((e) => $(e).text().toLowerCase().indexOf(r) !== -1))).includes(true);

            const delta = {
                isCovid: links,
                links: ($('[href]')
                    .map(function (){ return $(this).attr('href'); }) as unknown as string[])
            };

            delta.links = Array.from(delta.links)
                .filter((href) => href.match(/economist.com\/.+\/\d{4}\/\d{2}\/\d{2}/g));

            return delta;
        });

        return result;
    }

    get name() { return 'Economist'; }
}

export default EconomistCrawler;