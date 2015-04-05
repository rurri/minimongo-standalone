module.exports = function(grunt) {
  require('time-grunt')(grunt);
  var sourceTag = grunt.option('meteor-version');

  var fileDependecies = [
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

    'meteor-repo/packages/ordered-dict/ordered-dict.js',

    'meteor-repo/packages/tracker/tracker.js',

    'meteor-repo/packages/random/random.js',

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
    'meteor-repo/packages/minimongo/objectid.js'
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
          preserveComments: true
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

  grunt.loadNpmTasks('grunt-git');
  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-shell');

  grunt.registerTask('install', ['clean','gitclone', 'shell:fetch']);
  grunt.registerTask('fetch', ['checkParams', 'shell:fetch']);
  grunt.registerTask('build', ['clean:build', 'uglify']);

  grunt.registerTask('default', ['checkParams', 'clean','gitclone',  'uglify']);
};