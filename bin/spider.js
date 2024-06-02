'use strict';
/*
 * 
 *   ██████   █████  ███    ██  ██████  ███████ ██████  
 *   ██   ██ ██   ██ ████   ██ ██       ██      ██   ██ 
 *   ██   ██ ███████ ██ ██  ██ ██   ███ █████   ██████  
 *   ██   ██ ██   ██ ██  ██ ██ ██    ██ ██      ██   ██ 
 *   ██████  ██   ██ ██   ████  ██████  ███████ ██   ██
 *
 * The script relies on parsing HTML and URI's
 * This script uses deprecated libs/utils/frameworks. There is a high chance
 * that these dependencies are vulnerable to exploitation.
 *
 * For example:
 * casperjs  *
 * Severity: high
 * Improperly Controlled Modification of Dynamically-Determined Object Attributes in casperjs
 * No fix available
 * node_modules/casperjs
 *
 * https://github.com/advisories/GHSA-vrr3-5r3v-7xfw
 * https://security.snyk.io/vuln/SNYK-JS-CASPERJS-572803
 * 
 * LOW RISK USE CASE
 * For the simple the use case of recursively spidering apache2 or nginx
 * directory index pages, this script and its dependencies are likely to pose a
 * very low InfoSec risk.
 *
 * HIGH RISK USE CASE
 * Please be warned that running the script against public websites carries
 * significant risks. That is, the chances of inadvertently parsing something
 * from the public web that causes an unexpected or unwanted effect are not
 * zero.
 *
 * It might be possible to use snyk-protect package to mitigate known/patchable
 * exploits: https://www.npmjs.com/package/@snyk/protect
 *
 * 
 * DESCRIPTION
 *
 * This script attempts to spider/crawl the URI's specified by config.uriFile
 * i.e. starting at the first URI in config.uriFile, check the page for
 * a.hrefs, qualify those hrefs and then recursively check those URI's for
 * more a.hrefs.  The output of script is an aria2c download specification of
 * NON HTML URI's.
 *
 * This script is typically called by a another script which consumes the
 * aria2c download spec this script outputs, and then calls aria2c. The
 * calling script might implement interaction with the user, for example to
 * review the results of this script before calling aria2c.
 * 
 * The script was original created to recursively download files from an
 * apache2 directory index page.  The script could be modified to also
 * download HTML but that was not the original goal It shoud be relatively
 * straightforward to add a config options for this Adding this functionality
 * would mean the script could mirror/archive one or more websites
 * 
 * 
 * WHAT IS A URI
 *
 * A central theme of this script is URL's and URI's
 * For the purposes of this script the term URL and URI are interchangeable
 * Further reading:
 * The Committee that looks after the spec of URL's is the https://en.wikipedia.org/wiki/WHATWG
 * https://url.spec.whatwg.org/#url << The URL Standard defines URLs, domains, IP addresses, the application/x-www-form-urlencoded format, and their API.
 * https://en.wikipedia.org/wiki/URL << uniform resource locator (URL), colloquially known as an address on the Web
 * https://en.wikipedia.org/wiki/URI << Uniform Resource Identifier (URI), formerly Universal Resource Identifier
 * Nice URI syntax diagram: https://upload.wikimedia.org/wikipedia/commons/d/d6/URI_syntax_diagram.svg
 * 
 * 
 * DEPENDENCIES
 * 
 * The script uses CasperJS, a navigation scripting & testing utility for the PhantomJS (WebKit) and SlimerJS (Gecko) headless browsers
 * https://casperjs-dev.readthedocs.io/
 * PhantomJS: a QtWebKit based headless web browser https://phantomjs.org/
 * an alt to PhantomJS is SlimerJS which requires FireFox https://slimerjs.org/download.html
 *
 * Unfortunately CasperJS, PhantomJS and SlimerJS have become inactive and deprecated projects.
 * This is likely in part due to Chrome and Firefox supporting native headless modes
 * 
 * Solution?
 * Puppeteer might be a future alt? con: Chrome/Chromium?
 * Further reading:
 * https://pptr.dev/
 * https://www.puzzle.ch/de/blog/articles/2018/02/12/phantomjs-is-dead-long-live-headless-browsers
 * https://browsersync.io/
 * 
 * See also TODO.txt: https://github.com/PeterCxy/yarmd which looks like a nodejs native project
 * 
 * There are some python options too that cover beautiful-soup and selenium
 * https://realpython.com/modern-web-automation-with-python-and-selenium/
 * https://realpython.com/beautiful-soup-web-scraper-python/
 * https://www.freecodecamp.org/news/web-scraping-python-tutorial-how-to-scrape-data-from-a-website/
 * https://www.webscrapingapi.com/python-headless-browser
 * 
 *
 *  ██       ██████   ██████  ██  ██████ 
 *  ██      ██    ██ ██       ██ ██      
 *  ██      ██    ██ ██   ███ ██ ██      
 *  ██      ██    ██ ██    ██ ██ ██      
 *  ███████  ██████   ██████  ██  ██████ 
 * 
 * The logic of the script is roughly as follows:
 * 
 * for each uri in uris array, call spider method
 *   get HEAD uri
 *   if html
 *     GET uri
 *     extract a.hrefs to hrefs array
 *     for each href in hrefs array
 *       if each uriBlacklist is a negative match
 *         append href to pendingUris
 *     checkPending() - recursively call spider method if pendingUris remain 
 *   else
 *     append uri to actualDownloads
 *     checkPending() - recursively call spider method if pendingUris remain
 *  
 *  finally, set a ==CUT== point for the calling script
 *  output aria2c download specification of the actualDownloads, to be used by
 *  the calling script
 * 
 *  NOTES
 *  casperjs has getCurrentUrl method, which returns a url-decoded url, might be useful
 *  cite: https://casperjs-dev.readthedocs.io/en/latest/modules/casper.html#getcurrenturl
 *
 *
 *   ██████  █████  ███████ ██████  ███████ ██████       ██ ███████ 
 *  ██      ██   ██ ██      ██   ██ ██      ██   ██      ██ ██      
 *  ██      ███████ ███████ ██████  █████   ██████       ██ ███████ 
 *  ██      ██   ██      ██ ██      ██      ██   ██ ██   ██      ██ 
 *   ██████ ██   ██ ███████ ██      ███████ ██   ██  █████  ███████ 
 * 
 * >> CasperJS uses it's own JavaScript environment <<
 * CasperJS allows using nodejs modules installed through npm.
 * Note that since CasperJS uses it's own JavaScript environment, npm modules
 * that use node-specific features will not work under CasperJS.
 * cite: https://github.com/casperjs/casperjs/blob/master/docs/writing_modules.rst
 * cite: https://stackoverflow.com/a/24389819/490487
 * PhantomJS and SlimerJS (the engines that are used for CasperJS) are not
 * Node.js modules. They can be installed through npm for convenience.
 * They have a different base infrastructure of modules which is distinct from
 * Node.js.
 *
 * To be honest, in retrospect I wish I had not chosen a JavaScript-based
 * language for this script. I guess I've been disappointed by the limitations
 * of the Casper runtime.
 * 
 * For example, I just shake my head at the complexity of the comments in this
 * Q&A: https://stackoverflow.com/a/16053538/490487 regarding [].forEach.call()
 * in JavaScript.
 * 
 * Dealing with poorly documented sync and async functions in casperjs drove me
 * crazy. Promise chaining? Nice in principle, but doesn't help when a function
 * inside a promise is async?
 * 
 * Chaining or building actions in casperjs was infuriating. While loops and
 * async functions are not fun to figure out by trial and error...
 * 
 * I threw in the towel on trying to chain/build flow control with
 * start().then().then and went with a recursive approach.
 * 
 * Here is a link dump of things that might help others researching casperjs in
 * the future:
 * 
 * https://casperjs-dev.readthedocs.io/en/latest/modules/casper.html
 * https://phantomjs.org/api/webpage/
 * https://stackoverflow.com/questions/23033856/casper-js-run-method-firing-early
 * https://stackoverflow.com/questions/27176651/how-to-make-casperjs-wait-until-change-event-is-finished
 * https://stackoverflow.com/questions/22163583/how-to-wait-for-page-loading-when-using-casperjs
 * https://stackoverflow.com/questions/52104069/how-to-wait-until-evaluate-step-done-in-casperjs
 * https://stackoverflow.com/questions/27764128/does-casperjs-then-wait-on-emitted-events-in-the-previous-function
 * https://github.com/casperjs/casperjs/blob/master/samples/dynamic.js#L23
 * https://stackoverflow.com/questions/30105017/what-must-be-wrapped-in-then-statements-in-casperjs-how-to-determine-executio
 * https://stackoverflow.com/questions/31484329/asynchronous-call-during-a-synchronous-casperjs-operation
 * https://stackoverflow.com/questions/41964704/casperjs-phantomjs-then-in-do-while-loop-doesnt-work
 * https://stackoverflow.com/questions/37562169/asynchronous-process-inside-a-casperjs-script-for-while-loop/37565110#37565110
 * https://stackoverflow.com/questions/18835159/how-to-for-loop-in-casperjs
 * https://stackoverflow.com/questions/32426015/is-it-possible-to-make-for-loop-in-casperjs?rq=3
 * https://stackoverflow.com/questions/17590251/while-loop-in-casperjs
 * https://stackoverflow.com/questions/25597356/while-loop-to-setup-casperjs-then-steps
 * https://stackoverflow.com/questions/11604611/what-does-then-really-mean-in-casperjs/11957919#11957919
 * https://stackoverflow.com/questions/37849832/casperjs-loop-over-popup-links-on-page-a-and-return-to-page-a-after-scraping-a
 * https://stackoverflow.com/questions/11488014/asynchronous-process-inside-a-javascript-for-loop/11488129#11488129
 * https://stackoverflow.com/questions/40412726/casperjs-iterating-over-a-list-of-links-using-casper-each
 * https://stackoverflow.com/questions/36017827/casperjs-continue-inside-for-loop
 * https://developer.mozilla.org/en-US/docs/Glossary/IIFE
 *
 *
 *  ██   ██ ██ ███████ ████████  ██████  ██████  ██    ██ 
 *  ██   ██ ██ ██         ██    ██    ██ ██   ██  ██  ██  
 *  ███████ ██ ███████    ██    ██    ██ ██████    ████   
 *  ██   ██ ██      ██    ██    ██    ██ ██   ██    ██    
 *  ██   ██ ██ ███████    ██     ██████  ██   ██    ██   
 *
 * The first version of this script was written in the fourth quarter of 2017. 
 * At the time, the future state of casperjs and phantomjs was not yet known.
 * So giving them a try didn't seem like a totally horrible idea at the time.
 * So it didn't seem like such a terrible idea at the time.
 *
 * The early versions were reliable but customised/hard coded for their internal
 * use case.
 *
 * In 2024 I was doing some housekeeping and decided to fully document the
 * script, remove the hardcoding, add a config file and make some
 * improvements.
 *
 * I did a bit of testing using the script as a web crawler (sans HTML
 * download). It worked quite well. It was able to generate a download
 * manifest of my homepage (sans HTML) in about 4 seconds. I might consider
 * updating the functionality to support mirroring/archiving sites.
 * 
 * Now that the script logic is documented, I'd like to write a version in
 * either nodejs or python and remove the deprecated dependencies.
*/

// SCRIPT START

var DEBUG = false;

// require fs package so we can read files/configs
var fs = require('fs');

// uriParser
// looks like its not possible to use url or node:url in the phantomjs runtime
// cite: https://stackoverflow.com/a/24389819/490487
// info: https://nodejs.org/api/url.html
// info: https://www.npmjs.com/package/url
// info: https://stackoverflow.com/a/6168370/490487 it looks like this isn't available in phantom/casper
// maybe?: https://www.npmjs.com/package/url-parse
//var uriParser = require('url').parse; // << NOPE
//var uriParser = require('node:url').URL; // << NOPE
var uriParser = require('url-parse'); // << WORKS
// what is url origin? https://url.spec.whatwg.org/#concept-url-origin

var configPath='./config.yaml';
//var YAML = require('yaml'); // did not work in casperjs runtime
try {
  var YAML = require('js-yaml');
  var config = YAML.load(fs.read(configPath, { mode: 'r', charset: 'utf8' }));
} catch (err) {
  console.log('something went wrong trying to open/read config yaml:', configPath)
  console.log('caught:', err);
  phantom.exit(1);
}

// TODO support both uri black and whitelist e.g. config.uriFilter.Blacklist|Whitelist
var uriBlacklist = []
if ('undefined' !== typeof config.uriBlacklist && config.uriBlacklist && Array === config.uriBlacklist.constructor) {
  uriBlacklist = config.uriBlacklist;
  // regex array of URI's to ignore/blacklist
  uriBlacklist.forEach(function(value, index) {
    this[index] = new RegExp(value, 'i');
  }, uriBlacklist);
  // ^^ note the last arg: https://stackoverflow.com/a/12482991/490487
}
// TODO support both a domain black and whitelist
// IMPORTANT, the current implementation only checks uri.host not the full uri.href, this is by design
var domainWhitelist = []
if ('undefined' !== typeof config.domainWhitelist && config.domainWhitelist && Array === config.domainWhitelist.constructor) {
  domainWhitelist = config.domainWhitelist;
  // regex array of domains to whitelist 
  domainWhitelist.forEach(function(value, index) {
    this[index] = new RegExp(value, 'i');
  }, domainWhitelist);
  // ^^ note the last arg: https://stackoverflow.com/a/12482991/490487
}

// FIXME validation on the uris, encoding, etc, is phantomjs/casperjs/aria2c sensitive to unencoded uris?
try {
  var stream = fs.open(config.uriFile, { mode: 'r', charset: 'utf8' });
  var uris = [];
  while(!stream.atEnd()) {
      uris.push(uriParser(stream.readLine()));
  }
} catch (err) {
  console.log('something went wrong trying to open/read uris file:', config.uriFile)
  console.log('caught:', err);
  console.log('closing stream if defined');
  if (stream) stream.close();
  phantom.exit(1);
} finally {
  console.log('closing stream if defined');
  if (stream) stream.close();
}

// used in this script to access env vars
var system = require('system');

if (DEBUG) {
  var casper = require('casper').create({ verbose: true, logLevel: 'debug' });
} else {
  var casper = require('casper').create();
}

// uri variables
var visitedUris = [], pendingUris = [], actualDownloads = [];
// IDEA could create a skippedUris? could the array indexOf be cheaper .some regex? would need a benchmark.

// regex to detect HTML URI's
var textHtmlRegEx = new RegExp('text/html', 'i');

var counterNumberOfSpiderCalls = 0;
var maxSpiderRecursionDepth = 0;
var counterConcurrentSpiderCalls = 0;

// cite: https://stackoverflow.com/a/18101063/490487
function isInArray(value, array) {
  return array.indexOf(value) > -1;
}

// the main logic function, called recursively
function spider() {
  counterNumberOfSpiderCalls++;
  counterConcurrentSpiderCalls++;
  console.log('counterConcurrentSpiderCalls:', counterConcurrentSpiderCalls);
  var myUri = pendingUris.shift();
  casper.echo(casper.colorizer.format('<- Shifted ' + myUri.href + ' off the stack', { fg: 'blue' }));
  // I had to implment the next two if statements because returning
  // from this function returned out of the whole stack back to the orign
  // caller. Not sure if that is a JavaScript feature?
  if (false === isInArray(myUri.href, visitedUris)) {
    if (domainWhitelist.some(function(rx) { return rx.test(myUri.host); }) ) {
      // fetch HEAD myUri i.e. don't download, get info first
      casper.open(myUri.href, { method: 'head' }).then(function(response) {
        console.log('START HEAD OPEN')
        visitedUris.push(response.url)
        console.log('Opened:', response.url, 'contentType:', response.contentType, 'http status code:', response.status);
        if (DEBUG) console.log(JSON.stringify(response, null, 2))

        // logic for html URI's
        if (textHtmlRegEx.test(response.contentType)) {
          console.log('matched content type:', response.url, 'contentType: ', response.contentType);

          // GET the html page
          casper.open(response.url, { method: 'get' } ).then(function(response) {
            console.log('START GET OPEN');
            console.log('fetched:', response.url);
            
            // Find all a.hrefs present on this page, build the hrefs array
            // Why evaluate? To get access to __utils__: https://stackoverflow.com/a/22189482/490487
            var hrefs = this.evaluate(function() {
              var arr = [];
              // knowledge on forEach.call: https://stackoverflow.com/a/16053538/490487
              // :puke: reading the complexity on this Q&A makes me wish this was python and not js based
              // why not __utils__.findAll('a').forEach? makes accessing element easier?
              Array.prototype.forEach.call(__utils__.findAll('a'), function(element) {
                arr.push(element.getAttribute('href'));
              });
              return arr;
            });

            // for each href, for each uriBlacklist regex (rx), negative test the href, if OK append to pendingUris
            // needed to revent to for () loop to be able to use "continue"
            var hrefsLength = hrefs.length;
            for (var i=0; i < hrefsLength; i++) {
              var href = hrefs[i];
              // IMPORTANT: at this point we are dealing with the raw a.href, so it can be relative or absolute
              // Note: .some tests whether at least one element in the array passes the test implemented by the provided function.
              // Therefore, all regex patterns in uriBlacklist must be non-matching (false) in order for a href to be append to pendingUris
              // Any href that matches a pattern we want to skip
              if (! uriBlacklist.some(function(rx) { return rx.test(href); }) ) {
                var tmpHref = uriParser(href);
                if (! tmpHref.host) { // relative
                  href = uriParser(href, response.url); // for relative hrefs
                } else { // absolute
                  href = tmpHref;
                  // check domainWhitelist
                  if (! domainWhitelist.every(function(rx) { return rx.test(href.host); }) ) {
                    console.log('skip pending append, not on domain whitelist:', href.host);
                    continue;
                  }
                }
                // IMPORTANT href.href is now absolute
                // skip if already pending, probably cheaper than checking visitedUris first, as a rule its a shorter list
                if ( pendingUris.some(function(element) { return element.href === href.href; }) ) {
                  console.log('skip pending append, already pending:', href.href);
                  continue;
                }
                // skip if visitied
                if (true === isInArray(href.href, visitedUris)) {
                  console.log('skip pending append, already visited:', href.href);
                  continue;
                }
                pendingUris.push(href);
                casper.echo(casper.colorizer.format('-> Pushed ' + href.href + ' to the stack', { fg: 'blue' }));
              }
            };

            checkPending();
            console.log('END GET OPEN'); 
          }); // end casper.open GET
        // catch all logic for any other content type, if not html the script will append to actualDownloads array
        } else {
          // TODO should the uriBlacklist be checked here too?
          this.echo(this.colorizer.format('Actual Download: '+ response.url, { fg: 'green' }));
          actualDownloads.push(myUri);
          checkPending();
        }
        console.log('END HEAD OPEN')
      }); // end casper.open HEAD
    } else { // domain whitelist else
      console.log('skipping not in domain whitelist:', myUri.href);
      checkPending();
    } // endif domain whole check
  } else { // visited else
    console.log('skipping visited:', myUri.href);
    checkPending();
  } // endif visited check
  console.log('SPIDER END');
  counterConcurrentSpiderCalls--;
} // end spider

// this function acts as a break for the recursive spider function
function checkPending() {
  console.log('check pending:', pendingUris.length);
  // If there are URLs to be processed
  if (pendingUris.length > 0) {
    //var nextUri = pendingUris.shift();
    //casper.echo(casper.colorizer.format('<- Popped ' + nextUri.href + ' from the stack', { fg: 'blue' }));
    maxSpiderRecursionDepth++;
    spider();
  }
}

// https://casperjs.readthedocs.io/en/latest/modules/casper.html#eachthen
// for each each uri, current item will be stored in the response.data property
// spider the uris
casper.start().eachThen(uris, function(response) {
  console.log('CASPER START ITERATOR')
  if ('undefined' !== typeof config.username) {
    config.http_pw = system.env['spider_pw'];
    casper.setHttpAuth(config.username, config.http_pw);
  }

  var uri = uriParser(response.data);
  // TODO opportunity to perform some URI validation here, well formed, absolute, any uriParser exceptions?
  pendingUris.push(uri);
  casper.echo(casper.colorizer.format('-> Pushed ' + uri.href + ' to the stack', { fg: 'blue' }));
  if (DEBUG) console.log(JSON.stringify(uri, null, 2))
  spider();
  console.log('CASPER START END ITERATOR\n');
});


// https://casperjs.readthedocs.io/en/latest/modules/casper.html#run
// Runs the whole suite of steps and optionally executes a callback when they’ve all been done. 
casper.run(function() {
  console.log('counterNumberOfSpiderCalls:', counterNumberOfSpiderCalls);
  console.log('maxSpiderRecursionDepth:', maxSpiderRecursionDepth);
  // CUT mark for the calling script
  casper.echo('\nfinished\n==CUT==');
  // output aria2c download specification
  Array.prototype.forEach.call(actualDownloads, function(uri) {
    casper.echo(uri.href);
    if ('undefined' !== typeof config.uriStripPaths && config.uriStripPaths) {
      casper.echo(' out='+decodeURIComponent(config.downloadPath+uri.pathname.replace(config.uriStripPaths, '')));
    } else {
      casper.echo(' out='+decodeURIComponent(config.downloadPath+uri.pathname));
    }

  });
  this.exit();
});

// SCRIPT END 
