module.exports = function (options) {
  return {
    ...options,
    mode: 'production',
    externals: {
      'serialport': 'commonjs serialport',
      '@serialport/bindings-cpp': 'commonjs @serialport/bindings-cpp',
    },
    optimization: {
      minimize: false, // ⚠ enlève la minification (trop lourd CPU)
    },
  };
};
