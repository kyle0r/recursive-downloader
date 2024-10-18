# Please use politely and responsibly
**⚠ This utility could result in significant bandwidth costs to you and/or a third party if misused ⚠**  
Left unattended with a sub-optimal config, `recursive-downloader` could traverse large portions of the public Internet (at least until local memory resources are exhausted) - such is the nature of HTML href recursion. Please use the utility politely and responsibly [[policy](https://en.wikipedia.org/wiki/Web_crawler#Politeness_policy)], and consider the local and remote bandwidth costs, and the impact of the number of HTTP requests made per second.

---
This file was edited with [stackedit.io](https://stackedit.io) ❤

---
# Name
`recursive-downloader` - An interactive CLI utility for recursive HTTP downloads.

# Version
First version: `2012.47.1`  
First release:  `2024.42.1`  
Current release `2024.42.1`  
Version convention: YEAR.WEEK.RELEASE  
Example: `date +'%G.%V.1'` where 1 is incremented per release within the given week

# Synopsis
Think of `rsync --recursive` for http-hosted directories and files.

Originally created to download a list of URIs recursively from web server directory indexes. The utility can mirror a remote HTTP file structure to the local filesystem. The functionality is similar to a web spider/crawler - any html content encountered is parsed for hrefs and **any non-html content types can be downloaded.**

The `recursive-downloader` utility operates on the command line as follows:

1. **URIs:** Prompts the user to provide a list of URIs.
1. **Spider:** Prior to file transfer, evaluates all URIs by recursively parsing html content searching for non-html hrefs, and generates a transfer manifest.
1. **Preview:** Presents the user with a preview of the transfer manifest, which can be edited.
1. **Transfer:** Prompts the user to start or cancel the file transfer.
1. **Efficient:** multi-part transfers thanks to `aria2c`, which supports `--max-overall-download-limit` to control bandwidth usage.

See the **Background** section to get more insights on why the utility came to be.

## Features
* Interactive CLI based utility
* Batch download multiple URIs
* Preview the discovered downloads prior to transfer
* Recursive download (mirroring) of files from HTTP(S) sites, `spider.js` crawls all hrefs
* Efficient recursion logic designed to mitigate infinite recursion of the same URIs
* AuthN
    * HTTP Basic user:pass authentication (single realm)
    * mTLS client certificates (single cert)
* Configuration
    * uriBlacklist - regex list to exclude matching URIs
    * uriPathBlacklist - regex list to exclude matching URI paths
    * domainWhitelist - URI hostname regex list to include matching hostnames
    * uriStripPaths - strip matching remote paths from local paths
    * downloadPath - specify the relative or absolute local path where downloads should be stored

`recursive-downloader` has the concept of `pendingUris`, `visitedUris` and `actualDownloads` which helps to keep recursion to a minimum and mitigate infinite recursion.
# Usage
The default invocation:
```
recursive-downloader
```
Example with AuthN - you will be prompted to type the password.  
You can also securely export `HTTP_PW` prior to invocation.
```
HTTP_USER=user recursive-downloader
```
Example modifying the download limit (10 Mebibyte/s):
```
DOWNLOAD_LIMIT=10M recursive-downloader
```
## Env vars
A number of env vars are available to control the utilities behaviour. One can specify them inline per the usage examples, or export them to the shell env.  
Note: Inline style sets the env vars for the invocation but doesn't export them to the shell env.
### General 
**`DEBUG`** if set (non-blank) turn on debug logging level. Default: none.  
**`EDITOR`** uses your existing `EDITOR` preference, or you can specify your preferred editor. `vim` is the fallback.  
**`URI_FILE`** specify a URI file, one URI per line. Default: `~/spider-uris.txt`  
**`CONFIG_FILE`** specify a config file. Default: `~/.config/recursive-downloader/config.yaml`  
### AuthN
**`HTTP_USER`** specify HTTP basic auth username. Default: none.  
**`HTTP_PW`** specify HTTP basic auth username. Default: none.  
### Network
The default network configuration for the `recursive-downloader` is to download max 1 URI at a time (1 queue item), but split the download into 10 parts. In most cases this will consume all available local bandwidth. This approach aims to download the current queue item as quickly as possible. Use the env vars to tune this to your preference.

**`DOWNLOAD_LIMIT`** Default: `0` - no limit. Sets the `aria2c --max-overall-download-limit` option which sets the  max overall download speed in **bytes/sec**. You can append **K** or **M** for **K**ibibytes/s and **M**ebibytes/s. For example `DOWNLOAD_LIMIT=1M` would limit overall bandwidth to 1 Mebibyte/s.  
**`MAX_CONCURRENT_DOWNLOADS`** Default: 1 - Sets the `aria2c --max-concurrent-downloads` option which sets the maximum number of parallel downloads for every queue item.  
**`MAX_CONNECTIONS_PER_SERVER`** Default: 10 - Sets the `aria2c --max-connection-per-server` option which sets the maximum number of connections to one server for each download.  
**`SPLIT`** Default: 10 - Sets the `aria2c --split` option which sets how many connections should be used to download a file aka multi-part / multi-threaded download.


## Demo video
https://github.com/user-attachments/assets/63f89cd0-91d1-49f4-bfd6-dd591f5faaa0

# Limitations
## `Content-Type: text/html` 
In its current form, `recursive-downloader` downloads MIME types that **DO NOT** match the `text/html` pattern. In other words, by default, the utility downloads everything but HTML.  
💡 It would be relatively easy to change the logic to optionally download HTML. Feel free to submit a PR or feature request.

MIME types are also known as Media Type [🔗](https://en.wikipedia.org/wiki/Media_type) or the HTML header `Content-Type` [🔗](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Type)  
When `recursive-downloader` encounters a URI with `Content-Type: text/html`, it fetches the resource and parses any hrefs. The hrefs are added to the list of `pendingUris`. There is no "downloading" of the HTML to file.  \
Reference: A list of common MIME types hosted by Mozilla [here](https://developer.mozilla.org/en-US/docs/Web/HTTP/MIME_types/Common_types).
## Local memory
`recursive-downloader` maintains lists of the URIs it processes in memory; if the URIs being processed have an extreme number of hrefs, then `spider.js` can be expected to run out of local memory.  This could be mitigated by offloading the list storage to a larger and/or more efficient list storage mechanism, such as an `sqlite` database, or even file backed storage.
## CasperJS
I recommend reading the `spider.js` code docs to understand more about how `spider.js` works and some of the drawbacks of `CasperJS`. There are limitations on which `npm` packages can be run within the `CasperJS` runtime. This is a good reason to port the code to a modern web spider library. In other words, I would port the code before implementing external URI list storage, so that the utility is not restricted in its choice of libraries. There are some ideas captured in the code docs.
# Installation
💡🔐 The following steps are preferably performed as a non-root user for best InfoSec practice.
## Automated installer
See the demo video for an example of how to install and run `recursive-downloader`.
### Quick start
```
curl -sSL https://raw.githubusercontent.com/kyle0r/recursive-downloader/main/install.sh | sh
```
### What the installer does
The installer provides detailed information about what it will do when invoked. To perform the installation steps, you need to set the `THIS_IS_FINE` env var. For example:
```
curl -sSL https://raw.githubusercontent.com/kyle0r/recursive-downloader/main/install.sh | THIS_IS_FINE=Y sh
```
## Source install
TODO
## Distro install package?
Not yet. The focus has been on developing a robust shell installer for individual users, that installs into the user's `~/.local` directory structure. The project depends on `nvm`/`node` and also has two deprecated `npm` package dependencies. I don't feel that users would want to install this project system-wide (requiring root privileges), but rather on a per-user basis. This is also in line with the trend I've noticed for open source utilities, which are moving towards self-contained/virtual envs and user-specific installs.

For example, in order to create a .deb package, I'd need to figure out the `nvm`/`node` dependency and how `nvm` would or wouldn't work with `dpkg`. I'd need to check how other projects have handled the `nvm`/`node` dependency.
**Conclusion:** Maybe one day, maybe if/when I port the spider logic to python or similar, the `nvm`/`node` dependency will be removed.

💡 **Research TODO:** Is there a `dpkg` pattern for non system-wide per-user installs? Similar to `systemd` system units vs. user units. Maybe the package could prompt the user to choose a user or system install type?
# Upgrading
Run the installer and the latest release will be downloaded from GitHub and installed. Upgrading will overwrite code but not config.
# Uninstall
TODO (Documented but not implemented): Run the installer with the `--uninstall` option.
# Documentation
## Warnings
💡 The risk of being exploited is very low if you never try to download html links (html content invokes href recursion) and only use direct download links. Obviously, this use case skips the recursion feature, which is one of the most useful features of the `recursive-downloader` utility.

The project currently uses two deprecated libraries. `CasperJS` and `PhantomJS`. Care should be taken to understand the risks you may be exposing yourself to. For example, performing recursive downloads on sites you own or have a high level of trust in the html content should be fine.  

⚠🔐 **However,** there is an inherent risk in downloading from unknown sites, as there may be something in the parsed html that tries to exploit the deprecated libraries. **I strongly recommend that you read the `spider.js` [🔗](https://github.com/kyle0r/recursive-downloader/blob/main/bin/spider.js) code docs if you plan to use the utility on untrusted sites.**

💡🔐 In the `spider.js` [🔗](https://github.com/kyle0r/recursive-downloader/blob/main/bin/spider.js) code docs, I have tried to cover the details and mitigations for obvious risks.

### Low risk
TODO details available in the code docs of `spider.js` [🔗](https://github.com/kyle0r/recursive-downloader/blob/main/bin/spider.js)
### High risk
TODO details available in the code docs of `spider.js` [🔗](https://github.com/kyle0r/recursive-downloader/blob/main/bin/spider.js)
## Config docs
The example config contains suitable in-line documentation. [🔗](https://github.com/kyle0r/recursive-downloader/blob/main/config/config-example.yaml)
## Code docs
Both `recursive-downloader.sh` [🔗](https://github.com/kyle0r/recursive-downloader/blob/main/recursive-downloader.sh) and `spider.js` [🔗](https://github.com/kyle0r/recursive-downloader/blob/main/bin/spider.js) have relatively verbose code docs. You can also check out `/docs/NOTES.txt` [🔗](https://github.com/kyle0r/recursive-downloader/blob/main/docs/NOTES.txt) which documents some historical details and challenges of the project.
## Sequence Diagram
In the docs folder you will find `recursive-downloader.seqdiag` [🔗](https://github.com/kyle0r/recursive-downloader/blob/main/docs/recursive-downloader.seqdiag) which is written in seqdiag format [[repo](https://github.com/blockdiag/seqdiag)] [[docs](http://blockdiag.com/en/seqdiag)].  
The svg image is rendered and hosted by [kroki.io](https://kroki.io) ❤  
A mirror of the svg is available in the docs folder.

The diagram should provide just enough detail to give a good visual introduction and overview of how the `recursive-downloader` script runs and interacts with the user and CasperJS, and the projects main dependencies.

![enter image description here](https://kroki.io/seqdiag/svg/eNqVkU1Pg0AQhu_-ignpQQ9w8OrHRbGhMdG09WQMGZaxLKG7687aHoz_XSi0Lg3UeH0zz5OZd5g-cokr-DoDEJUECG8hQy7gtcKMKriBwJL4tCw3FOZ6qyqNOdmIi-DtqmZ2szUTTOL7ZPk0Dzywi2DyMk_Sh-Qx9pDr8BfpeZTOCe6QDdnZwreJXVZyVDKwkc0SJbfGY-ikJ9PasbNo_safC1ROr_u8acNIqpKEm_H5PmgXXAgrjbvwzZ6mVm8pY7Ibsp6zvWeEqas6MEPrNlUeMb2aR5vYv5NhjUq-E7t__BStxPRgSAcMYy9uyEvhObvgtLIbGilwGi97Y35nAxc3s98_1TrtoA==)
## Logic `spider.js`
Here is a permalink to the logic doc block in `spider.js` [🔗](https://github.com/kyle0r/recursive-downloader/blob/d25ff030c86bd0b197ec5276cfa74af157d35465/bin/spider.js#L113).

## Older `wget` version
The repo has a `2017.01.1` tag [🔗](https://github.com/kyle0r/recursive-downloader/tree/2017.01.1), which is the last version of the tool that used `wget` before I wrote `spider.js` for `CasperJS` and replaced the `wget` logic. It might be interesting to browse the code or try this version to see how it worked. I tested the `2017.01.1` tag in 2024 and it still worked as intended.
# Bugs
Open an issue via the GitHub project and/or submit a pull request. [[GitHub repo issues link](https://github.com/kyle0r/recursive-downloader/issues)]
# Contributing
Feel free to make a feature request or fork the project and make pull requests etc. [[GitHub repo PR link](https://github.com/kyle0r/recursive-downloader/pulls)]
# Background
**Original goal:** Download files recursively from HTTP-hosted directory indexes.

I wanted to give the user interactive decision steps and a preview of what would be transferred, with the option to abort before the data transfer stage (preview, then abort or start).

I wanted to be able to control bandwidth usage for background downloads, but also have the option to use all available bandwidth, for example for off-peak transfers.

Why not just use `rsync` or other protocols that support recursive file transfer?

* The `ftp://` protocol is outdated and unencrypted, typically without bandwidth control.
* The `rsync://` protocol is unencrypted.
* Provisioning `rsync://` `sftp://`, `ssh://` and `scp://` access is more challenging for a sysop, especially with a hardened security configuration, and more difficult for a user to use. **Read:** higher barrier to entry.
* The protocols require the user to be provisioned with a Linux account and appropriate authentication methods, and a sysop must carefully consider how to harden the system against user exploitation. An exception: Some FTP servers support virtual users.
* `rsync` via `ssh` has inherently slow transfer speeds and is single threaded, the same is true for `tar` via `ssh`, `sftp` and `scp` and other ssh-based protocols.
* ssh-based transfers are inherently more resource-intensive. The `rsync` client and server processes can also be quite resource intensive.
* When the `recursive-downloader` script was born ~2012, HPN-SSH [🔗](https://github.com/rapier1/hpn-ssh) did not seem ready for production - this should be re-evaluated as the project matures, as `rsync` + `HPN-SSH` seems very attractive BUT still more complex.
* Using HPN-SSH would introduce a delay in receiving upstream security patches from OpenSSH, and the fact that HPN-SSH is an OpenSSH fork that changes the behaviour of the OpenSSH core may introduce other security concerns.
* In some cases it is not possible to access the remote site using the protocols mentioned. Read: Hosting doesn't offer/support the protocol.
* With the exception of HPN-SSH, the above protocols do not support concurrent multi-part / split transfers, which generally means that not all available bandwidth is used.

# History
Since ~2012, `recursive-downloader` has been my go-to script when I've had a batch of HTTP downloads to perform. Especially if the remote site was web server directory indexes.

In 2012-Nov, the original `recursive-downloader` was born, using simple shell techniques, `wget` to create the download manifest and `aria2c` to perform the downloads. You can review and/or use the latest version using `wget` by looking at the git tag `2017.01.1` [🔗](https://github.com/kyle0r/recursive-downloader/tree/2017.01.1).

In 2017 I wrote the first version of `spider.js` utilising `CasperJS` which in turn utilises `PhantomJS`. Sometime between 2017 and 2019 `spider.js` replaced the rudimentary `wget` functionality.

In early 2024, I began some housekeeping and documentation of the project, and wrote some new features for `spider.js`. One of my long-term goals was to publish the project. Looking to the future, these activities supported my goal of retiring the projects deprecated dependencies and porting the main logic to `node`, `python` or `rust`.

In late 2024 I was preparing the project to be published on GitHub, making minor improvements, ensuring code quality checks like `shellcheck` and `jshint` were OK. Writing the `install.sh` and preparing the CI/CD pipeline etc.

# Why HTTP file hosting?

HTTP file hosting is ubiquitous and very fast, especially when using a client that can split / multi-thread transfers. HTTP(s) transfers consume minimal host resources. It is easy for a sysop to provision, and very easy for a user to access.  
Access control is easy to configure. Transit encryption is relatively easy to configure, especially with the advent of Certificate Authorities (CA's) such as Let's Encrypt [🔗](https://en.wikipedia.org/wiki/Let%27s_Encrypt), which offer their service free of charge.

When serving HTTPS websites, most CPUs support hardware offloading of the encryption to help keep the cost of encryption nominal. See: [Wikipedia: AES instruction set](https://en.wikipedia.org/wiki/AES_instruction_set)

From my sysop experience, I'd rank provisioning a web server for static file hosting with directory indexing [🔗](https://en.wikipedia.org/wiki/Basic_access_authentication), basic access authentication [🔗](https://en.wikipedia.org/wiki/Basic_access_authentication) and transport layer security [🔗](https://en.wikipedia.org/wiki/Transport_Layer_Security), aka SSL/TLS, as the easiest of the other file transfer protocols mentioned. A significant advantage of this approach is that it requires minimal security hardening configuration on the host and **there is no need to provision a Linux user,** thus skipping the security implications. Hosting static files on a web server presents a low security risk / exposure. 

## CDN / ease of scaling up

HTTP offers the ability to place the remote host behind a third party CDN/cache (or deploy your own CDN!), giving a sysop the ability to scale to an almost unlimited number of concurrent clients. The only real limitation is the financial cost of the bandwidth provided by the CDN provider.

## HTTP download client

Enter the fantastic `aria2c` [🔗](https://aria2.github.io/) utility which markets itself as "The ultra-fast download utility". It lives up to this slogan, supporting concurrent multi-part / split transfers and can efficiently max out available client and/or server bandwidth. I've been using `aria2c` since at least 2013. Unfortunately, `aria2c` does not support recursive downloads.  
`aria2c` provides an rpc server which allows client applications to connect to the server to act as download monitor or manager.

So, in Q4 of 2012, with the aforementioned drawbacks of `rsync` and ssh-based transfers, and the lack of recursive download support in `aria2c`, I set about writing a script that would use the HTTP protocol and `aria2c` to achieve my goals.

... a few moments later ... the first revision of `recursive-downloader.sh` was born. It utilised the `wget --mirror --spider` features to recursively trawl/spider URI's. `wget` would chekc URI's exist but not download them, and my `recursive-downloader` parsed the `wget` log to produce a download manifest for `aria2c`.

## InfoSec and Privacy
As with any technology choice, there are pros and cons. As I was writing the README for this project, I went down a HTTP InfoSec rabbit hole. I have published my in-depth research on HTTP privacy and security concerns on the the Handy to know Shizzle Blog [Research on HTTP privacy and security concerns](https://coda.io/@ff0/handy-to-know-shizzle/research-on-http-privacy-and-security-concerns-7)
# Side quest?
I would consider the code and code docs in this repo to be a fairly holistic capture of how to write a basic web spider using `CasperJS`. The knowledge and experience gained over the years of development could be consumed and applied to speed up similar or forked projects. Sharing this knowledge was one of my motivations for publishing the project.

In particular, if you study the code docs in `spider.js` [🔗](https://github.com/kyle0r/recursive-downloader/blob/main/bin/spider.js), you should be in a strong position to understand `CasperJS`, what it can do from a website navigation perspective, and its limitations. There is extensive documentation on how I achieved the recursive behaviour with `CasperJS`. It was challenging at first because of the async nature of some of the `CasperJS` functions. Overall, there is a considerable amount of links and citations to reference documentation and examples.

The knowledge captured in `/docs/NOTES.txt` [🔗](https://github.com/kyle0r/recursive-downloader/blob/main/docs/NOTES.txt) should also provide some useful insights and cover some of the challenges I faced and how I overcame them, in particular how I kept the utility running through numerous Linux distro upgrades over the years.

Have fun and happy coding. Feel free to ping me if you have any spidery coding adventures of your own.

# License
Released under MIT License. See the LICENSE file for complete details. [🔗](https://github.com/kyle0r/recursive-downloader/blob/main/LICENSE)
## Disclaimer
Per the license:  
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

