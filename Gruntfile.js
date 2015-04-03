module.exports = function(grunt) {
  require('time-grunt')(grunt);
  var sourceTag = grunt.option('meteor-version');

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

    browserify: {
      dist: {
        src: ['meteor-repo/packages/base64/base64.js', 'meteor-repo/packages/ejson/ejson.js', 'helpers/meteor.js', 'meteor-repo/packages/minimongo/id_map.js',
          'meteor-repo/packages/minimongo/minimongo.js', 'meteor-repo/packages/minimongo/sort.js',
          'meteor-repo/packages/minimongo/**/*.js',
          '!meteor-repo/packages/minimongo/*_tests.js', '!meteor-repo/packages/minimongo/package.js'],
        dest: 'minimongo.js',
        exclude : ['meteor-repo/packages/minimongo/*_tests.js'],
        ignore : ['meteor-repo/packages/minimongo/*_tests.js']
      }
    },

    uglify: {
      my_target: {
        report : 'gzip',
        files: {
          'minimongo.min.js': ['minimongo.js']
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
  grunt.registerTask('build', ['clean:build', 'browserify', 'uglify']);

  grunt.registerTask('default', ['checkParams', 'clean','gitclone', 'browserify', 'uglify']);
};