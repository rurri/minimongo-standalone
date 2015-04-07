module.exports = function(grunt) {
  var sourceTag = grunt.option('meteor-version');
  var fileDependecies = [
    'helper.js',
    'meteor-repo/packages/meteor/client_environment.js',
    'meteor-repo/packages/meteor/helpers.js',
    'meteor-repo/packages/meteor/setimmediate.js',
    'meteor-repo/packages/meteor/timers.js',
    'meteor-repo/packages/meteor/errors.js',
    'meteor-repo/packages/meteor/fiber_stubs_client.js',
    'meteor-repo/packages/meteor/debug.js',

    'meteor-repo/packages/base64/base64.js',

    'meteor-repo/packages/jason/json_native.js',
    'meteor-repo/packages/jason/json2.js',

    'meteor-repo/packages/ejson/ejson.js',

    'meteor-repo/packages/id-map/id-map.js',

    'meteor-repo/packages/ordered-dict/ordered_dict.js',

    'meteor-repo/packages/tracker/tracker.js',
    'meteor-repo/packages/tracker/deprecated.js',

    'meteor-repo/packages/random/random.js',

    'meteor-repo/packages/geojson-utils/pre.js',
    'meteor-repo/packages/geojson-utils/geojson-utils.js',
    'meteor-repo/packages/geojson-utils/post.js',

    'meteor-repo/packages/minimongo/minimongo.js',
    'meteor-repo/packages/minimongo/wrap_transform.js',
    'meteor-repo/packages/minimongo/helpers.js',
    'meteor-repo/packages/minimongo/selector.js',
    'meteor-repo/packages/minimongo/sort.js',
    'meteor-repo/packages/minimongo/projection.js',
    'meteor-repo/packages/minimongo/modify.js',
    'meteor-repo/packages/minimongo/diff.js',
    'meteor-repo/packages/minimongo/id_map.js',
    'meteor-repo/packages/minimongo/observe.js',
    'meteor-repo/packages/minimongo/objectid.js',

    'meteor-repo/packages/meteor/dynamics_browser.js',

    'meteor-repo/packages/reactive-var/reactive-var.js',
    'meteor-repo/packages/reactive-dict/reactive-dict.js'
  ];

  var testDependencies = [
    'helper.js',
    'meteor-repo/packages/tinytest/tinytest.js',
    'meteor-repo/packages/tinytest/tinytest_client.js',
    'meteor-repo/packages/minimongo/minimongo_tests.js',
    'test_helpers.js'
  ];

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    gitclone: {
      clone: {
        options: {
          repository: 'https://github.com/meteor/meteor.git',
          directory: 'meteor-repo'
        }
      }
    },

    shell: {
      fetch: {
        command: [
          'git -C meteor-repo fetch -t',
          'git -C meteor-repo checkout "release/METEOR@' + sourceTag + '"'
        ].join('&&')
      }
    },

    uglify: {
      nonMangled: {
        options: {
          mangle: false,
          compress: false,
          preserveComments: true,
          beautify: true,
          wrap: 'Minimongo'
        },

        files: {
          'minimongo.js': fileDependecies
        }
      },
      mangled: {
        options: {
          mangle: true,
          compress: true,
          preserveComments: false
        },

        files: {
          'minimongo.min.js': 'minimongo.js'
        }
      },
      tests: {
        options: {
          mangle: false,
          compress: true,
          preserveComments: true,
          beautify: true,
          wrap: 'MinimongoTests',
          exportAll: true
        },

        files: {
          'minimongo-tests.js': testDependencies
        }
      }


    },

    clean: {
      fetch: ["meteor-repo/"],
      build: ["minimongo.js", "minimongo.min.js"]
    }

  });

  grunt.task.registerTask('checkParams', 'Check required command line params', function() {
    if (!sourceTag) {
      grunt.fail.fatal('--meteor-version="<Version>" is required. Example: --meteor-version="1.1.0.1"');
    }
  });

  grunt.task.registerTask('runTests', 'Run tests on minimongo', function() {
    var done = this.async();
    _ = require('underscore');
    require('./minimongo.min.js');
    require('./minimongo-tests.js');

    var testRun = TestManager.createRun(reportResults);
    testRun.run();

    var testCount = resultTree[0].groups[0].tests.length;

    var waitCount = 0;
    var testCompleteCheckInterval = setInterval(function() {
      waitCount++;
      //Wait up to 10 seconds for tests to finish.
      if (waitCount > 100 || (passedCount + failedCount == testCount)) {
        var testSummary = failedCount + ' tests failed. ' + passedCount + ' tests passed.';
        if (passedCount + failedCount != testCount) {
          grunt.fail.fatal("Not all tests completed. " + testCount + " total tests. " + testSummary);
        } else if (failedCount) {
          grunt.fail.fatal(testSummary);
        } else {
          grunt.log.oklns(testSummary);
        }
        done();
        clearInterval(testCompleteCheckInterval);
      }
    }, 100);
  });

  grunt.loadNpmTasks('grunt-git');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-shell');

  grunt.registerTask('install', ['clean','gitclone', 'shell:fetch']);
  grunt.registerTask('fetch', ['checkParams', 'shell:fetch']);
  grunt.registerTask('build', ['clean:build', 'uglify']);
  grunt.registerTask('test', ['runTests']);

  grunt.registerTask('default', ['checkParams', 'clean:build','gitclone', 'fetch', 'uglify', 'runTests']);
};