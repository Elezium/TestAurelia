/* */ 
var $def = require("./$.def"),
    $ = require("./$"),
    cof = require("./$.cof"),
    $iter = require("./$.iter"),
    SYMBOL_ITERATOR = require("./$.wks")('iterator'),
    FF_ITERATOR = '@@iterator',
    VALUES = 'values',
    Iterators = $iter.Iterators;
module.exports = function(Base, NAME, Constructor, next, DEFAULT, IS_SET, FORCE) {
  $iter.create(Constructor, NAME, next);
  function createMethod(kind) {
    return function() {
      return new Constructor(this, kind);
    };
  }
  var TAG = NAME + ' Iterator',
      proto = Base.prototype,
      _native = proto[SYMBOL_ITERATOR] || proto[FF_ITERATOR] || DEFAULT && proto[DEFAULT],
      _default = _native || createMethod(DEFAULT),
      methods,
      key;
  if (_native) {
    var IteratorPrototype = $.getProto(_default.call(new Base));
    cof.set(IteratorPrototype, TAG, true);
    if ($.FW && $.has(proto, FF_ITERATOR))
      $iter.set(IteratorPrototype, $.that);
  }
  if ($.FW)
    $iter.set(proto, _default);
  Iterators[NAME] = _default;
  Iterators[TAG] = $.that;
  if (DEFAULT) {
    methods = {
      keys: IS_SET ? _default : createMethod('keys'),
      values: DEFAULT == VALUES ? _default : createMethod(VALUES),
      entries: DEFAULT != VALUES ? _default : createMethod('entries')
    };
    if (FORCE)
      for (key in methods) {
        if (!(key in proto))
          $.hide(proto, key, methods[key]);
      }
    else
      $def($def.P + $def.F * $iter.BUGGY, NAME, methods);
  }
};
