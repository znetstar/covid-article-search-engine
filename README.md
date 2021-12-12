# COVID-19 Search Engine

## Introduction

This is a simple search engine for articles related to COVID-19 created for a class project.

## Requirements 

This project requires Docker and Docker Compose and Node.js version 14+ (to transfer cookies, see below).

### Transferring Cookies

This project requires subscriptions to *the Wall Street Journal*, *the Economist*, and *the New York Times*, which 
are where the articles are drawn from.

Download Google Chrome and login to those three sites in the browser.

Startup the databases using `docker-compose up mongo redis_mq redis_cache`, then Run the backend located in the `engine` 
folder on your local machine with the copy cookie env variable set to true (`TRANSFER_COOKIES=1 npm start`).

Your cookies should be copied from Chrome to MongoDB.

## Building and Running

You can start with `docker-compose up web engine`.

If you'd like to build the containers yourself, run `docker-compose up web engine --build`.

The backend should begin copying articles into the database, which can be queried from the 
frontend at "http://localhost:3000".

## License

This project has been released into the public domain under the terms of the Creative Commons Zero v1.0 Universal,
a copy of which can be found in `LICENSE.txt`.