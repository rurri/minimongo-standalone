////
//// Take incoming results and drive resultsTree
////

 running = true;
 totalCount = 0;
 passedCount = 0;
 failedCount = 0;
 failedTests = [];

resultTree = [];

Package = {};

// report a series of events in a single test, or just the existence of
// that test if no events. this is the entry point for test results to
// this module.
reportResults = function(results) {
  var test = _findTestForResults(results);

  // Tolerate repeated reports: first undo the effect of any previous report
  var status = _testStatus(test);
  if (status === "failed") {
    failedCount--;
  } else if (status === "succeeded") {
    passedCount--;
  }

  // Now process the current report
  if (_.isArray(results.events)) {
    // append events, if present
    Array.prototype.push.apply((test.events || (test.events = [])),
        results.events);
    // sort and de-duplicate, based on sequence number
    test.events.sort(function (a, b) {
      return a.sequence - b.sequence;
    });
    var out = [];
    _.each(test.events, function (e) {
      if (out.length === 0 || out[out.length - 1].sequence !== e.sequence)
        out.push(e);
    });
    test.events = out;
  }
  status = _testStatus(test);
  if (status === "failed") {
    failedCount++;
    // Expand a failed test (but only set this if the user hasn't clicked on the
    // test name yet).
    if (test.expanded === undefined)
      test.expanded = true;
    if (!_.contains(failedTests, test.fullName))
      failedTests.push(test.fullName);

  } else if (status === "succeeded") {
    passedCount++;
  } else if (test.expanded) {
    // re-render the test if new results come in and the test is
    // currently expanded.
  }
};

// given a 'results' as delivered via reportResults, find the
// corresponding leaf object in resultTree, creating one if it doesn't
// exist. it will be an object with attributes 'name', 'parent', and
// possibly 'events'.
var _findTestForResults = function (results) {
  var groupPath = results.groupPath; // array
  if ((! _.isArray(groupPath)) || (groupPath.length < 1)) {
    throw new Error("Test must be part of a group");
  }

  var group;
  var i = 0;
  _.each(groupPath, function(gname) {
    var array = (group ? (group.groups || (group.groups = []))
        : resultTree);
    var newGroup = _.find(array, function(g) { return g.name === gname; });
    if (! newGroup) {
      newGroup = {
        name: gname,
        parent: (group || null),
        path: groupPath.slice(0, i+1),
        dep: new Tracker.Dependency
      }; // create group
      array.push(newGroup);

    }
    group = newGroup;
    i++;
  });

  var testName = results.test;
  var server = !!results.server;
  var test = _.find(group.tests || (group.tests = []),
      function(t) { return t.name === testName &&
          t.server === server; });
  if (! test) {
    // create test
    var nameParts = _.clone(groupPath);
    nameParts.push(testName);
    var fullName = nameParts.join(' - ');
    test = {
      name: testName,
      parent: group,
      server: server,
      fullName: fullName,
      dep: new Tracker.Dependency
    };
    group.tests.push(test);
    totalCount++;
  }

  return test;
};



////
//// Helpers on test objects
////

var _testTime = function(t) {
  if (t.events && t.events.length > 0) {
    var lastEvent = _.last(t.events);
    if (lastEvent.type === "finish") {
      if ((typeof lastEvent.timeMs) === "number") {
        return lastEvent.timeMs;
      }
    }
  }
  return null;
};

var _testStatus = function(t) {
  var events = t.events || [];
  if (_.find(events, function(x) { return x.type === "exception"; })) {
    // "exception" should be last event, except race conditions on the
    // server can make this not the case.  Technically we can't tell
    // if the test is still running at this point, but it can only
    // result in FAIL.
    return "failed";
  } else if (events.length == 0 || (_.last(events).type != "finish")) {
    return "running";
  } else if (_.any(events, function(e) {
        return e.type == "fail" || e.type == "exception"; })) {
    return "failed";
  } else {
    return "succeeded";
  }
};

