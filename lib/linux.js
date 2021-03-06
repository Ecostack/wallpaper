'use strict';
const path = require('path');
const childProcess = require('child_process');
const bluebird = require('bluebird');

const execFilePromise = bluebird.promisify(childProcess.execFile, {multiArgs: true});

const appsList = [
	{
		cmd: 'gsettings',
		set: ['set',
			'org.gnome.desktop.background',
			'picture-uri',
			'file://%s'
		],
		get: ['get',
			'org.gnome.desktop.background',
			'picture-uri'
		],
		transform: imagePath => imagePath.slice(8, -1)
	},
	{
		cmd: 'setroot',
		set: ['%s']
	},
	{
		cmd: 'pcmanfm',
		set: ['-w %s']
	},
	{
		cmd: 'feh',
		set: ['--bg-scale', '%s']
	},
	{
		cmd: 'xfconf-query',
		set: ['-c xfce4-desktop',
			'-p /backdrop/screen0/monitor0/image-path',
			'-s %s'
		]
	},
	{
		cmd: 'gconftool-2',
		set: ['--set',
			'/desktop/gnome/background/picture_filename',
			'--type=string',
			'%s'
		]
	},
	{
		cmd: 'dcop',
		set: ['kdesktop',
			'KBackgroundIface',
			'setWallpaper',
			'%s 1'
		]
	},
	{
		cmd: 'dconf',
		set: ['write',
			'/org/mate/desktop/background/picture-filename',
			'"%s"'],
		get: ['read',
			'/org/mate/desktop/background/picture-filename'
		],
		transform: imagePath => imagePath.slice(1, -1)
	}
];

let availableApps;

function setAvailableApps() {
	const availableAppsDict = {};

	availableApps = [];

	const names = appsList.map(el => {
		availableAppsDict[el.cmd] = el;
		return el.cmd;
	});

	// `which` all commands and expect stdout to return a positive
	const whichCmd = `which -a ${names.join('; which -a ')}`;


	return new Promise((resolve) => {
		childProcess.exec(whichCmd, (error, stdout, stderr)=> {
			resolve(stdout);
		})
	}).then((result) => {
		let stdout = result.trim();

		if (!stdout) {
			throw new Error('None of the apps were found');
		}

		stdout = stdout.split('\n');

		stdout.forEach(el => {
			// it's an alias
			if (el[0] !== path.sep) {
				return;
			}

			el = el.split(path.sep).pop();

			availableApps.push(availableAppsDict[el]);
		});
	});
}

exports.get = function get() {
	if (!availableApps) {
		return setAvailableApps().then(get);
	}

	const app = availableApps.find(app => app.get);

	return execFilePromise(app.cmd, app.get).then(result => {
		let stdout = result[0].trim();

		if (typeof app.transform === 'function') {
			return app.transform(stdout);
		}

		return stdout;
	});
};

exports.set = function set(imagePath) {
	if (typeof imagePath !== 'string') {
		return Promise.reject(new TypeError('Expected a string'));
	}

	if (!availableApps) {
		return setAvailableApps().then(() => set(imagePath));
	}

	const app = availableApps.find(app => app.set);
	const params = app.set.slice();

	params[params.length - 1] = params[params.length - 1].replace('%s', path.resolve(imagePath));

	return execFilePromise(app.cmd, params);
};
