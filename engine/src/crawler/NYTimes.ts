import {CrawlerBase} from "./CrawlerBase";
import { ScrapeResult} from "../common";
import {Page} from "playwright";


export class NYTimesCrawler extends CrawlerBase {
    async scrape(link: string): Promise<ScrapeResult> {
        await this.login();

        return super.scrape(link);
    }
    async isCovid(page: Page) {
        await CrawlerBase.injectJquery(page);
        const result: { isCovid: boolean, links: string[] } = await page.evaluate(async () => {
            const delta = {
                isCovid: ($('span:contains("The Coronavirus Pandemic")').last().text()) === "The Coronavirus Pandemic",
                links: ($('[href]')
                    .map(function (){ return $(this).attr('href'); }) as unknown as string[])
            };

            delta.links = Array.from(delta.links)
                .filter((href) => href.match(/https:\/\/www\.nytimes\.com\/\d{4}\/\d{2}\/\d{2}/));

            return delta;
        });

        return result;
    }

    get name() { return 'NYTimes'; }
}

export default NYTimesCrawler;