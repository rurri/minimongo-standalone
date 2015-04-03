Meteor = {};
LocalCollection = {};
IdMap = {};

function useSetImmediate() {
  if (! global.setImmediate)
    return null;
  else {
    var setImmediate = function (fn) {
      global.setImmediate(fn);
    };
    setImmediate.implementation = 'setImmediate';
    return setImmediate;
  }
}


// Android 2.3.6, Chrome 26, Firefox 20, IE 8-9, iOS 5.1.1 Safari

function usePostMessage() {
  // The test against `importScripts` prevents this implementation
  // from being installed inside a web worker, where
  // `global.postMessage` means something completely different and
  // can't be used for this purpose.

  if (!global.postMessage || global.importScripts) {
    return null;
  }

  // Avoid synchronous post message implementations.

  var postMessageIsAsynchronous = true;
  var oldOnMessage = global.onmessage;
  global.onmessage = function () {
    postMessageIsAsynchronous = false;
  };
  global.postMessage("", "*");
  global.onmessage = oldOnMessage;

  if (! postMessageIsAsynchronous)
    return null;

  var funcIndex = 0;
  var funcs = {};

  // Installs an event handler on `global` for the `message` event: see
  // * https://developer.mozilla.org/en/DOM/window.postMessage
  // * http://www.whatwg.org/specs/web-apps/current-work/multipage/comms.html#crossDocumentMessages

  // XXX use Random.id() here?
  var MESSAGE_PREFIX = "Meteor._setImmediate." + Math.random() + '.';

  function isStringAndStartsWith(string, putativeStart) {
    return (typeof string === "string" &&
    string.substring(0, putativeStart.length) === putativeStart);
  }

  function onGlobalMessage(event) {
    // This will catch all incoming messages (even from other
    // windows!), so we need to try reasonably hard to avoid letting
    // anyone else trick us into firing off. We test the origin is
    // still this window, and that a (randomly generated)
    // unpredictable identifying prefix is present.
    if (event.source === global &&
        isStringAndStartsWith(event.data, MESSAGE_PREFIX)) {
      var index = event.data.substring(MESSAGE_PREFIX.length);
      try {
        if (funcs[index])
          funcs[index]();
      }
      finally {
        delete funcs[index];
      }
    }
  }

  if (global.addEventListener) {
    global.addEventListener("message", onGlobalMessage, false);
  } else {
    global.attachEvent("onmessage", onGlobalMessage);
  }

  var setImmediate = function (fn) {
    // Make `global` post a message to itself with the handle and
    // identifying prefix, thus asynchronously invoking our
    // onGlobalMessage listener above.
    ++funcIndex;
    funcs[funcIndex] = fn;
    global.postMessage(MESSAGE_PREFIX + funcIndex, "*");
  };
  setImmediate.implementation = 'postMessage';
  return setImmediate;
}


function useTimeout() {
  var setImmediate = function (fn) {
    global.setTimeout(fn, 0);
  };
  setImmediate.implementation = 'setTimeout';
  return setImmediate;
}


Meteor._setImmediate =
    useSetImmediate() ||
    usePostMessage() ||
    useTimeout();

Meteor._debug = function (/* arguments */) { };

Meteor._SynchronousQueue = function () {
  var self = this;
  self._tasks = [];
  self._running = false;
  self._runTimeout = null;
};

Meteor._inherits = function (Child, Parent) {
  // copy Parent static properties
  for (var key in Parent) {
    // make sure we only copy hasOwnProperty properties vs. prototype
    // properties
    if (_.has(Parent, key))
      Child[key] = Parent[key];
  }

  // a middle member of prototype chain: takes the prototype from the Parent
  var Middle = function () {
    this.constructor = Child;
  };
  Middle.prototype = Parent.prototype;
  Child.prototype = new Middle();
  Child.__super__ = Parent.prototype;
  return Child;
};

Meteor.defer = function (f) {
  Meteor._setImmediate(bindAndCatch("defer callback", f));
};
