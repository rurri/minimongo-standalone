# Minimongo-Standalone [![Build Status](https://travis-ci.org/rurri/minimongo-standalone.svg?branch=master)](https://travis-ci.org/rurri/minimongo-standalone)
Minimongo javascript code released as part of Meteor version:**1.1.0.1**

## Requirements
underscore, async

*These are listed as dependencies in both bower and npm and will be installed automatically

## Bower Install
Easiest way to install is via bower:

`bower install minimongo-standalone`

## NPM Install
To install via npm run:

`npm install minimongo-standalone --save`

## Manual Download
You could also just download the minimongo.min.js, place it on your server, and reference it in your source.

For browsers

`<script src="/js/minimongo.min.js"></script>`

For servers

`require('./minimongo.min.js');`

## Future Enhancements
* File lists of required meteor js files are hardcoded, would be nice to look at package manifests, and to dynamically generate this file list in case file dependencies are added later.

## Grunt scripts
Code is pulled and generated from the minimongo db package as published by meteor: https://github.com/meteor/meteor

These only need to be run if you are interested in extracting minimongo from meteor and generating the minimongo.js and minimongo.min.js files yourself. Otherwise it is safe to ignore the grunt scripts.

2 Files are generated automatically from these grunt scripts:
* minimongo.js - Standalone version of minimongo suitable for use on servers (or browsers during debug if size is not an issue)
* minimongo.min.js - The above file but minified for use in browsers

This repo contains grunt scripts suitable for fetching and building the latest minimongo source files and packaging them up for consumption via npm and bower.

These scripts do not need to be run unless you intend to create your own version of the minimongo files (minimongo.js and minimongo.min.js) instead of using the versions checked into github and made available via direct download, bower, or npm.

Requirements:
The grunt scripts require that git is installed and available in your path.

To install and package these files up, just run npm install followed by grunt.

```
npm install
grunt --meteor-version="1.1.0.1"
```

This will fetch the latest code and create two files in the root folder:
* minimongo.js
* minimongo.min.js

Other helpful commands:

|Command|Result|
|-------|--------|
|grunt|Performs all steps required for fetching, building, and testing the minimongo.js files from meteor|
|grunt install|Performs just initial clone of meteor and checkouts appropriate tag for target release|
|grunt fetch|Performs just a fetch of meteor and checkouts appropriate tag for target release|
|grunt build|Assumes meteor is at appropriate version, and performs just build tasks uglify|
|grunt test|Assumes meteor is at appropriate version, and performs just test tasks|
|grunt clean|Cleans up any files that can be rebuilt|
