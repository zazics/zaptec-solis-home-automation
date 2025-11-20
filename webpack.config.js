module.exports = {
  mode: 'production',
  externals: [],
  resolve: {
    extensions: ['.ts', '.js']
  },
  optimization: {
    minimize: false // ⚠ enlève la minification (trop lourd CPU)
  }
};
