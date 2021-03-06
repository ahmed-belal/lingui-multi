#! /usr/bin/env node

'use strict';

const compile = require('@lingui/cli/api/compile');
const extract = require('@lingui/cli/api/extract');
const commander = require('commander');
const rimraf = require('rimraf');
const tmp = require('tmp');
const _ = require('lodash');

const path = require('path');
const util = require('util');
const fs = require('fs');

var packageFile = undefined;
var localeDir = undefined;

commander.version(require("../package.json").version).arguments("[package-json]  [locale-dir]"
).action(function (packageJson, localeDirectory)
{
    packageFile = packageJson;
    localeDir = localeDirectory;
}).parse(process.argv);



if (typeof packageFile === 'undefined')
{
    console.info('No package.json path supplied, using default: ./package.json');
    packageFile = './package.json';
}

console.info('Package json: ' + path.resolve(packageFile));

if (fs.existsSync(packageFile) === false)
{
    console.error('ERROR: package.json does not exist');
    process.exit(1);
}

var packageObject = JSON.parse(fs.readFileSync(packageFile));

if (typeof localeDir === 'undefined')
{
    console.info('No locale directory path supplied, using default: ./locale');
    localeDir = './locale';
}

console.info('Locale directory: ' + path.resolve(localeDir));

if (fs.existsSync(localeDir) === false)
{
    console.error('ERROR: locale directory does not exist');
    process.exit(1);
}

var locales = fs.readdirSync(localeDir);

if (!('lingui' in packageObject))
{
    console.error('ERROR: No lingui config found');
    process.exit(1);
}

if (!('lingui-multi' in packageObject))
{
    console.error('ERROR: No lingui-multi bundles config found');
    process.exit(1);
}



// The directory where we are going to do the extract/collect
console.info("Creating temporary build directory");
const targetDir = tmp.dirSync().name;

let buildDir = targetDir + '/_build';

// Create build dir if not exist
if (fs.existsSync(buildDir) === false)
    fs.mkdirSync(buildDir);

console.info('Build scratchpad directory: ' + path.resolve(buildDir));

let bundle;

// Iterate the language bundles
for (bundle in packageObject['lingui-multi'])
{
    console.info(util.format("Building %s language bundle", bundle));
    // Remove build dir contents on each run
    rimraf.sync(buildDir + '/*');

    let options = Object.assign({}, packageObject.lingui);

    let srcPathDirs = packageObject.lingui.srcPathDirs;

    // Dirty patch for <rootDir>
    options.srcPathDirs = [];

    srcPathDirs.forEach(function (dir)
    {
        options.srcPathDirs.push(dir.replace('<rootDir>', path.dirname(packageFile)));
    });


    // Convert from CLI to API keys
    if ('srcPathIgnorePatterns' in options)
    {
        options.ignore = options.srcPathIgnorePatterns;
    }

    if ('srcPathIgnorePatterns' in packageObject['lingui-multi'][bundle])
    {
        options.ignore = (options.ignore || []).concat(packageObject['lingui-multi'][bundle]['srcPathIgnorePatterns']);
    }

    delete options.srcPathIgnorePatterns;

    extract.extract(options.srcPathDirs, targetDir, options);

    let catalogObject = extract.collect(targetDir);

    let keys = Object.keys(catalogObject);

    // Go over each locale
    locales.forEach(function (locale)
    {
        // Only continue if locale is a directory
        if (fs.lstatSync(path.resolve(localeDir, locale)).isDirectory() === false)
        {
            return;
        }

        let filePath = util.format('%s/%s/messages.json', localeDir, locale);
        if (fs.existsSync(filePath) === false)
        {
            console.info(util.format('INFO: File not found for conversion: %s', filePath));
            return;
        }

        let messagesObject = {};
        messagesObject = Object.assign(messagesObject, JSON.parse(fs.readFileSync(filePath)));

        let screenedMessages = _.pick(messagesObject, keys);

        let jsData = compile.createCompiledCatalog(locale, screenedMessages);

        let targetFile = util.format('%s/%s/%s.messages.js', localeDir, locale, bundle);

        fs.writeFileSync(targetFile, jsData);

        console.info(util.format('Wrote %d messages to %s', Object.keys(screenedMessages).length, targetFile));
    });

}

console.info("Done");

