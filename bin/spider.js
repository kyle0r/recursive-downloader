#!/usr/bin/env casperjs.js
// Note the .js extension - this is the node launch wrapper to casperjs

/* jshint devel: true, node: true */
/* globals phantom, __utils__ */
'use strict';
/*
 * Note: Removal of python dependency
 * While checking the dependencies and documenting the utility, I discovered
 * that I had inadvertently created a dependency on python by using the
 * CasperJS python wrapper: casperjs/bin/casperjs.  
 * CasperJS offers a number of launch wrappers, python, node and so on.
 * I updated the utility to use bin/casper.js (not the .js extension) which is
 * a node wrapper. This change removes the utilities dependency on python.
 *
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
 * The script uses CasperJS, a navigation scripting & testing utility for the
 * PhantomJS (WebKit) and SlimerJS (Gecko) headless browsers
 * https://casperjs-dev.readthedocs.io/
 * PhantomJS: a QtWebKit based headless web browser https://phantomjs.org/
 * an alt to PhantomJS is SlimerJS which requires FireFox https://slimerjs.org/download.html
 *
 * Unfortunately CasperJS, PhantomJS and SlimerJS have become inactive and
 * deprecated projects.  This is likely in part due to Chrome and Firefox
 * supporting native headless modes
 * 
 * Solution?
 * Puppeteer might be a future alt? con: Chrome/Chromium?
 * Further reading:
 * https://pptr.dev/
 * https://www.puzzle.ch/de/blog/articles/2018/02/12/phantomjs-is-dead-long-live-headless-browsers
 * https://browsersync.io/
 * 
 * See also TODO.txt: https://github.com/PeterCxy/yarmd which looks like a
 * nodejs native project
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
 *   if contentType html
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
 * finally, set a ==CUT== point for the calling script
 * output aria2 download manifest of the actualDownloads, to be used by
 * the calling script
 * 
 * NOTES
 * casperjs has getCurrentUrl method, which returns a url-decoded url, might be
 * useful cite:
 * https://casperjs-dev.readthedocs.io/en/latest/modules/casper.html#getcurrenturl
 *
 * Regarding:
 * [warning] [phantom] Loading resource failed with status=fail (HTTP 200)
 * For the scripts use case these warning can be ignored. You'll notice a
 * pattern that the warnings only appear for URI's that are not a text based
 * contentType. 
 * The warning appears to be related to the QtWebKit/PhantomJS code and how they
 * handle HTTP contentType response header. For the use case in this script the
 * warnings can be ignored because we only call HTTP HEAD method on non text
 * contentType's. Further reading: https://stackoverflow.com/a/38460907
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
 * node.js.
 *
 * To be honest, in retrospect I wish I had not chosen a JavaScript-based
 * language for this script. I guess I've been disappointed by the limitations
 * of the CasperJS / JavaScript runtime.
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
 * https://stackoverflow.com/a/20953499 # decent CasperJS boilerplate
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
 *
 *
 *  ████████  ██████  ██████   ██████  
 *     ██    ██    ██ ██   ██ ██    ██ 
 *     ██    ██    ██ ██   ██ ██    ██ 
 *     ██    ██    ██ ██   ██ ██    ██ 
 *     ██     ██████  ██████   ██████  
 *
 * * To align with https://en.wikipedia.org/wiki/Web_crawler#Politeness_policy
 *   The script should really have a throttle mechanism to prevent overloading
 *   the remote sites during spider/crawl operations
 *
 * * Add an option to prevent the spider from traversing out of/above the
 *   starting URI path. This may actually be a reasonable default?
*/

// SCRIPT START

var DEBUG = false;

// require fs package so we can read files/configs
var fs = require('fs');

/*
 * If /dev/tty is writable, then we can use this device for sending progress updates to the terminal
 * /dev/tty: In each process, a synonym for the controlling terminal associated with the process group of that process, if any.
 * cite: https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap10.html
*/
var TTY = false;
if (fs.isWritable('/dev/tty')) TTY = true;

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

// used in this script to access env vars
var system = require('system');

if (system.env.DEBUG) DEBUG = true;

// handle path topics
var cwd = fs.absolute('.');
var HOME = system.env.HOME;

if (!HOME || false === fs.isAbsolute(HOME)) {
  console.log('env var HOME was not set OR is not an absolute path.');
  console.log('spider.js relies on HOME env var being set to the absolute path of the current users home directory. Aborting.'); 
  phantom.exit(1);
}

if (false === fs.exists(cwd+'/node_modules') ) {
  console.log('node_modules could not be found in the cwd. Aborting.');
  phantom.exit(1);
}

/* 
 * replace tilde (~) with a given replacement, e.g. absolute path to home dir
 * regex logic:
 * assert that the string starts with a tilde: ^~
 * start a positive lookahead (non consuming) to assert one of the following:
 *  the end of the string: $
 *  OR a forward slash: /
 *  OR a back slash: \
 * 
 * ~ will match
 * ~/blah will match
 * ~something will not match
 * example: https://regex101.com/r/NRhwqa/1
*/
function pathTildeDecode(path, replacement) {
  return path.replace(/^~(?=$|\/|\\)/, replacement);
}

var configFile = './config.yaml';
// override configFile if CONFIG_FILE env is set
if (system.env.CONFIG_FILE) {
  configFile = system.env.CONFIG_FILE;
}
configFile = pathTildeDecode(configFile, HOME);
console.log('configFile: ', configFile);

if (false === fs.exists(configFile)) {
  console.log('The specified config yaml does not exist. Aborting.');
  phantom.exit(1);
}

//var YAML = require('yaml'); // did not work in casperjs runtime
try {
  var YAML = require('js-yaml');
  var config = YAML.load(fs.read(configFile, { mode: 'r', charset: 'utf8' }));
} catch (err) {
  console.log('Caught:', err);
  console.log('Something went wrong trying to open/read config yaml:', configFile);
  console.log('Aborting.');
  phantom.exit(1);
}

// TODO support both uri black and whitelist e.g. config.uriFilter.Blacklist|Whitelist
var uriBlacklist = [];
if ('undefined' !== typeof config.uriBlacklist && config.uriBlacklist && Array === config.uriBlacklist.constructor) {
  uriBlacklist = config.uriBlacklist;
  // regex array of URI's to ignore/blacklist
  uriBlacklist.forEach(function(value, index) {
    this[index] = new RegExp(value, 'i');
  }, uriBlacklist);
  // ^^ note the last arg: https://stackoverflow.com/a/12482991/490487
}

var uriPathBlacklist = [];
if ('undefined' !== typeof config.uriPathBlacklist && config.uriPathBlacklist && Array === config.uriPathBlacklist.constructor) {
  uriPathBlacklist = config.uriPathBlacklist;
  // regex array of path+query to ignore/blacklist
  uriPathBlacklist.forEach(function(value, index) {
    this[index] = new RegExp(value, 'i');
  }, uriPathBlacklist);
  // ^^ note the last arg: https://stackoverflow.com/a/12482991/490487
}

// TODO support both a domain black and whitelist
// IMPORTANT, the current implementation only checks uri.host not the full uri.href, this is by design
var domainWhitelist = [];
if ('undefined' !== typeof config.domainWhitelist && config.domainWhitelist && Array === config.domainWhitelist.constructor) {
  domainWhitelist = config.domainWhitelist;
  // regex array of domains to whitelist 
  domainWhitelist.forEach(function(value, index) {
    this[index] = new RegExp(value, 'i');
  }, domainWhitelist);
  // ^^ note the last arg: https://stackoverflow.com/a/12482991/490487
}

// override config.uriFile if URI_FILE env is set
if (system.env.URI_FILE) {
  config.uriFile = system.env.URI_FILE;
}

config.uriFile = pathTildeDecode(config.uriFile, HOME);

// FIXME validation on the uris, encoding, etc, is phantomjs/casperjs/aria2c sensitive to unencoded uris?
try {
  var stream = fs.open(config.uriFile, { mode: 'r', charset: 'utf8' });
  var uris = [];
  while(!stream.atEnd()) {
      uris.push(uriParser(stream.readLine(), {}));
  }
} catch (err) {
  console.log('something went wrong trying to open/read uris file:', config.uriFile);
  console.log('caught:', err);
  console.log('closing stream if defined');
  if (stream) stream.close();
  phantom.exit(1);
} finally {
  console.log('closing stream if defined');
  if (stream) stream.close();
}

// https://casperjs-dev.readthedocs.io/en/latest/modules/casper.html#index-1
// https://casperjs-dev.readthedocs.io/en/latest/modules/casper.html#pagesettings
var casperConfig = {
  verbose: false,
  logLevel: 'error',
  viewportSize: {
    width: 1024,
    height: 768
  },
  pageSettings: {
    "loadImages": false,
    "loadPlugins": false,
    "webSecurityEnabled": false,
    "javascriptEnabled": true

  }
};

if (DEBUG) {
  casperConfig.verbose = true;
  casperConfig.logLevel = 'debug';
}
var casper = require('casper').create(casperConfig);

// uri variables
// visitedUris is a simple list of URI strings
var visitedUris = [];
// pendingUris and actualDownloads are lists of parsed URI objects
var pendingUris = [], actualDownloads = [];
// IDEA could create a skippedUris? could the array indexOf be cheaper .some regex? would need a benchmark.

// regex to detect HTML URI's
var textHtmlRegEx = new RegExp('text/html', 'i');

var counterNumberOfSpiderCalls = 0;
var maxSpiderRecursionDepth = 0;
var counterConcurrentSpiderCalls = 0;

// cite: https://stackoverflow.com/a/18101063/490487
function isInArray(array, value) {
  return array.indexOf(value) > -1;
}

// At least one of the RegEx patterns in array should match searchValue
function valueMatchesAtLeastOnePattern(array, searchValue) {
  return array.some(function(regex) { return regex.test(searchValue); });
}

// At least one of the href's in array should be identical to href
function arrayContainsHref(array, href){
  return array.some(function(element) { return element.href === href; });
}

// Write a progress message to the terminal
// ref: https://stackoverflow.com/q/2388090/490487
// ref: https://stackoverflow.com/q/12628327/490487
function updateProgressIndicator(msg) {
  // ref: https://en.wikipedia.org/wiki/ANSI_escape_code
  // ref: https://gist.github.com/fnky/458719343aabd01cfb17a3a4f7296797
  // ref: https://sw.kovidgoyal.net/kitty/keyboard-protocol/
  // ref: https://medium.com/israeli-tech-radar/terminal-escape-codes-are-awesome-heres-why-c8eb938b1a1c
  // ref: https://stackoverflow.com/q/4842424/490487
  // \r aka ^M aka 0x0D aka CR writes a carriage return, which sends the terminal cursor to the left most position on the same line
  // \E aka ^[ aka 0x1B aka ESC starts an escape sequence
  // [ is the Control Sequence Introducer (CSI) which per the ANSI escape code docs is an Fe (C1) type escape sequence
  // K ^K aka EL is the control sequence for "Erase in Line" aka "clear to end of line" (see also: tput el)
  // summary: sends the terminal cursor to the left and clears to end of line
  /* jshint -W113 */
  if (TTY) fs.write('/dev/tty', '\r[KProgress: '+msg); 
  /* jshint +W113 */
}

// the main logic function, called recursively
function spider() {
  counterNumberOfSpiderCalls++;
  counterConcurrentSpiderCalls++;
  console.log('counterConcurrentSpiderCalls:', counterConcurrentSpiderCalls);
  var myUri = pendingUris.shift();
  casper.echo( casper.colorizer.format('<- Shifted ' + myUri.href + ' off the stack', { fg: 'blue' }) );
  // I had to implment the next two if statements because returning
  // from this function returned out of the whole stack back to the orign
  // caller. Not sure if that is a JavaScript feature?
  if ( false === isInArray(visitedUris, myUri.href) ) {
    // TODO should uriBlacklist && uriPathBlacklist be checked here too?
    // Current logic: the assumption is that the URI's in the uriFile do not need to be compared to the blacklists
    if ( true === valueMatchesAtLeastOnePattern(domainWhitelist, myUri.host) ) {
      // fetch HEAD myUri i.e. don't download, get info first
      casper.open(myUri.href, { method: 'head' }).then(function(response) {
        console.log('START HEAD OPEN');
        visitedUris.push(response.url);
        var logMsg = 'status: ' + response.status + ' | contentType: ' + response.contentType + ' | URI: ' + response.url;
        console.log(logMsg);
        updateProgressIndicator(logMsg);
        if (DEBUG) console.log(JSON.stringify(response, null, 2));

        // logic for html URI's
        if (200 == response.status && textHtmlRegEx.test(response.contentType)) {
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

            var hrefsLength = hrefs.length;
            if (DEBUG) console.log ('hrefsLength:', hrefsLength);
            // for each href, for each uriBlacklist regex (rx), negative test the href, if OK append to pendingUris
            // Had to revert to a for () loop to be able to use "continue"
            for (var i=0; i < hrefsLength; i++) {
              var rawHref = hrefs[i];
              // Handle URI's that skip the protocol and begin with // aka scheme-relative-URL
              // ref: https://stackoverflow.com/a/3583129
              // ref: https://url.spec.whatwg.org/#scheme-relative-url-string
              var protocolPrefix = (rawHref.match(/^\/\//)) ? myUri.protocol : '';
              
              // Parse the href - use baseURL={} rather than default: baseURL=location
              // We want to ignore the value of location
              // ref: https://www.npmjs.com/package/url-parse#usage
              var href = uriParser(protocolPrefix+rawHref, {});
              href.rawHref = rawHref;
              href.wasRelative = (!href.host) ? true : false;
              // for relative hrefs, we want to ensure the rawHref is evaluated
              var uriPathBlacklistTest = (href.wasRelative) ? href.rawHref : href.pathname+href.query+href.hash;

              // Handle relative hrefs
              if (href.wasRelative) {
                // for relative hrefs we pass baseURL=response.url, this converts the href from relative to absolute
                href = uriParser(rawHref, response.url);
                href.wasRelative = true;
                href.rawHref = rawHref;
              }
              // IMPORTANT for consistency, the logic is to ensure that href.href is always absolute, href.rawHref stores the original raw href

              if (DEBUG) console.log('wasRelative:', href.wasRelative, 'raw href:', href.rawHref, 'parsed href:', href.href);

              // Any href that matches the uriBlacklist we want to skip
              if ( false === valueMatchesAtLeastOnePattern(uriBlacklist, href.href) ) {
                // Any path that matches uriPathBlacklist we want to skip
                if ( false === valueMatchesAtLeastOnePattern(uriPathBlacklist, uriPathBlacklistTest) ) {
                  // only check the domainWhitelist for absolue URI's
                  if (false === href.wasRelative) {
                    // Any domain not in the domainWhitelist we want to skip 
                    if ( false === valueMatchesAtLeastOnePattern(domainWhitelist, href.host) ) {
                      if (DEBUG) console.log('skip pending append, not on domain whitelist:', href.host);
                      continue;
                    }
                  }
                  
                  // skip if already pending, probably cheaper than checking visitedUris first, as a rule its a shorter list
                  if ( true === arrayContainsHref(pendingUris, href.href) ) {
                    if (DEBUG) console.log('skip pending append, already pending:', href.href);
                    continue;
                  }
                  // skip if visitied
                  if (true === isInArray(visitedUris, href.href)) {
                    if (DEBUG) console.log('skip pending append, already visited:', href.href);
                    continue;
                  }
                  pendingUris.push(href);
                  casper.echo(casper.colorizer.format('-> Pushed ' + href.href + ' to the stack', { fg: 'blue' }));
                } else {
                  if (DEBUG) console.log('skip pending append, href matches uriPathBlacklist:', href.href);
                }
              } else {
                if (DEBUG) console.log('skip pending append, href matches uriBlacklist:', href.href);
              }
            }

            checkPending();
            console.log('END GET OPEN'); 
          }); // end casper.open GET
        // catch all logic for any other content type, if not html the script will append to actualDownloads array
        } else {
          if (200 == response.status) {
            // TODO should the uriBlacklist be checked here too?
            this.echo(this.colorizer.format('Actual Download: '+ response.url, { fg: 'green' }));
            actualDownloads.push(myUri);
          }
          checkPending();
        }
        console.log('END HEAD OPEN');
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
  console.log('CASPER START ITERATOR');
  // setHttpAuth if present in env
  config.httpUser = ('undefined' !== typeof system.env.HTTP_USER && system.env.HTTP_USER) ? system.env.HTTP_USER : false;
  config.httpPass = ('undefined' !== typeof system.env.HTTP_PW && system.env.HTTP_PW) ? system.env.HTTP_PW : false;
  if (false !== config.httpUser && false !== config.httpPass) {
    casper.setHttpAuth(config.httpUser, config.httpPass);
  }

  var uri = uriParser(response.data, {});
  // TODO opportunity to perform some URI validation here, well formed, absolute, any uriParser exceptions?
  pendingUris.push(uri);
  casper.echo(casper.colorizer.format('-> Pushed ' + uri.href + ' to the stack', { fg: 'blue' }));
  if (DEBUG) console.log(JSON.stringify(uri, null, 2));

  /*  
   * TODO Research what does the call stack look like when spider() processes
   * recursively?
   * TODO Investigate what is the memory usage like?
   * TODO Research if the call stack remains linear due to async function calls?
   * Note how 'SPIDER END' is output sequentially
   * If the code was fully synchronous, you would expect a nested call stack and
   * each SPIDER END to be output at the end of the script?
   * However, SPIDER END is consistently output just before each:
   * [info] [phantom] Step anonymous X/X: done
   * This would suggest that each spider call ends around the same time as the
   * next recursive call?
   * This would suggest that the spider() sub-calls to casper.open() are
   * effectively making spider() asynchronous.
   * TODO I assume this is good news for memory usage?
   *
   * My observation is that the recursive nature of spider calling itself
   * provides the required sequentially/synchronicity even though some
   * sub-calls are asynchronous.
   * Note how counterConcurrentSpiderCalls remains 1
   *
   * Note that END HEAD OPEN is logged directly after START HEAD OPEN but in the
   * code there is a bunch of logic that is designed to be synchronus, so this
   * strongly suggests the casper.open() method is async.
   * The nested casper.open() is logged with START GET OPEN
   * The SPIDER END is consistently logged before END GET OPEN
   *
   * INFO I'm pretty sure I tried logic: while (pendingUris.length > 0) spider()
   * which didn't work because of the async casper.open() sub-calls inside 
   * spider() effectively made the while loop asynchronous.
   * i.e. the while loop didn't wait for a loop iteration to finish before
   * starting the next loop iteration.
   */

  // call spider(), which will call itself recursively until all URI's have been evaluated
  spider();
  // TODO clear/update Progress line to completed state
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
