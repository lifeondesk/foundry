import { writeFile } from 'fs';
import { promisify } from 'util';
import { resolve } from 'path';
import {
  flow,
  get,
  includes,
  isUndefined,
  map,
  keys,
  omitBy,
  pick,
  reduce,
  zipObject,
  assign
} from 'lodash/fp';
import { SUPPORTED_CONFIGS, eslint, babel } from '../configs';

const writeFileAsync = promisify(writeFile);

const { ESLINT_CONFIGS } = eslint;
const { BABEL_CONFIGS } = babel;

function getConfigName(name, val) {
  const configs = {
    eslint: ESLINT_CONFIGS,
    prettier: ['base'],
    babel: BABEL_CONFIGS
  };

  const useBaseConfig = val === true;
  if (useBaseConfig) {
    return 'base';
  }

  const supportedConfigs = get(name, configs);

  const isSupportedConfig = includes(val, supportedConfigs);
  if (!isSupportedConfig) {
    console.warn(
      `Config ${val} is not available for ${name}. Falling back to base config.`
    );
    return 'base';
  }

  return val;
}

function createConfigExport(name, config) {
  return `module.exports = require('sumup-js/${name}').${config}`;
}

function writeConfigFile(name, content, targetDir) {
  const filenames = {
    eslint: '.eslintrc.js',
    prettier: 'prettier.config.js',
    babel: 'babel.config.js'
  };
  const filename = get(name, filenames);

  if (!filename) {
    throw new TypeError(`No filename found for config ${name}.`);
  }

  // FIXME: hack until we get babel 7 with js config support.
  if (name === 'babel') {
    const babelrcPath = resolve(targetDir, '.babelrc');
    const babelRc = { presets: ['./babel.config'] };
    writeFileAsync(babelrcPath, JSON.stringify(babelRc, null, 2));
  }

  const path = resolve(targetDir, filename);

  return writeFileAsync(path, content);
}

const getConfigs = flow(params => {
  const { all } = params;
  if (all) {
    return zipObject(['base', 'base', 'base'], SUPPORTED_CONFIGS);
  }
  return pick(SUPPORTED_CONFIGS, params);
}, omitBy(isUndefined));

export default function bootstrap(params) {
  // TODO: handle case where someone writes eslint config but not prettier
  //       config. Should at least get a message telling them they will either
  //       need to overwrite the eslint plugins/presets or provide one manually.
  const { targetDir } = params;
  const configParams = getConfigs(params);
  const tools = keys(configParams);

  const configs = reduce(
    (acc, tool) =>
      assign(acc, { [tool]: getConfigName(tool, configParams[tool]) }),
    {},
    tools
  );

  const configExportStrings = reduce(
    (acc, tool) =>
      assign(acc, { [tool]: createConfigExport(tool, configs[tool]) }),
    {},
    tools
  );

  // TODO: Add a flag for the target directory.
  return flow(
    map(tool => writeConfigFile(tool, configExportStrings[tool], targetDir)),
    promises => Promise.all(promises) // breaks if you don't put the arrow function here.
  )(tools);
}