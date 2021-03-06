/* */ 
var $ = require("./$"),
    cof = require("./$.cof"),
    RegExp = $.g.RegExp,
    Base = RegExp,
    proto = RegExp.prototype,
    re = /a/g,
    CORRECT_NEW = new RegExp(re) !== re,
    ALLOWS_RE_WITH_FLAGS = function() {
      try {
        return RegExp(re, 'i') == '/a/i';
      } catch (e) {}
    }();
if ($.FW && $.DESC) {
  if (!CORRECT_NEW || !ALLOWS_RE_WITH_FLAGS) {
    RegExp = function RegExp(pattern, flags) {
      var patternIsRegExp = cof(pattern) == 'RegExp',
          flagsIsUndfined = flags === undefined;
      if (!(this instanceof RegExp) && patternIsRegExp && flagsIsUndfined)
        return pattern;
      return CORRECT_NEW ? new Base(patternIsRegExp && !flagsIsUndfined ? pattern.source : pattern, flags) : new Base(patternIsRegExp ? pattern.source : pattern, patternIsRegExp && flagsIsUndfined ? pattern.flags : flags);
    };
    $.each.call($.getNames(Base), function(key) {
      key in RegExp || $.setDesc(RegExp, key, {
        configurable: true,
        get: function() {
          return Base[key];
        },
        set: function(it) {
          Base[key] = it;
        }
      });
    });
    proto.constructor = RegExp;
    RegExp.prototype = proto;
    $.hide($.g, 'RegExp', RegExp);
  }
  if (/./g.flags != 'g')
    $.setDesc(proto, 'flags', {
      configurable: true,
      get: require("./$.replacer")(/^.*\/(\w*)$/, '$1')
    });
}
require("./$.species")(RegExp);
