import {CrawlerBase} from "./CrawlerBase";
import {ScrapeResult} from "../common";
import {Page} from "playwright";


export class WSJCrawler extends CrawlerBase {
    async scrape(link: string): Promise<ScrapeResult> {
        await this.login();

        return super.scrape(link);
    }
    async isCovid(page: Page) {
        await CrawlerBase.injectJquery(page);
        const result: { isCovid: boolean, links: string[] } = await page.evaluate(async () => {
            const delta = {
                isCovid: !!$('h4:contains("Coronavirus")').length,
                links: ($('a[href*="wsj.com/articles"]')
                    .map(function (){ return $(this).attr('href'); }) as unknown as string[])
            };


            console.log(delta)
            delta.links = Array.from(delta.links)
                .filter((href) => href.match(/wsj\.com\/articles\/(.*)/));
            console.log(delta)

            return delta;
        });

        return result;
    }
    get name() { return 'WSJ'; }
}

export default WSJCrawler;