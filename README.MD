#Mongodb-Standalone
Minimongo javascript code released as part of Meteor version:**1.1.0.1**

2 Files are generated automatically from these grunt scripts:
* minimongo.js - Standalone version of minimongo suitable for use on servers (or browsers during debug if size is not an issue)
* minimongo.min.js - The above file but minified for use in browsers

*Note: Only **one** of these two files should be imported, not both.*

##Bower Install
To install via bower run
`bower install mongodb-standalone`

##NPM Install
To install via npm run
`npm install mongodb-standalone --save-`

##Grunt scripts
This repo contains grunt scripts suitable for fetching and building the latest mongodb source files and packaging them up for consumption via npm and bower.

These scripts do not need to be run unless you intend to create your own version of the mongodb files (minimongo.js and minimongo.min.js) instead of using the versions checked into github and made available via direct download, bower, or npm.

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

Other helpful commands
|Command|Result|
----------------
|grunt install|Performs just initial clone of meteor and checkouts appropriate tag for target release|
|grunt fetch|Performs just a fetch of meteor and checkouts appropriate tag for target release|
|grunt build|Assumes meteor is at appropriate version, and performs just build tasks (browserify/uglify)|
|grunt clean|Cleans up any files that can be rebuilt|