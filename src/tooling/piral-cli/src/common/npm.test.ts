import * as cp from 'child_process';
import { Stream } from 'stream';
import { resolve } from 'path';
import {
  dissectPackageName,
  installPackage,
  detectNpm,
  detectPnpm,
  detectYarn,
  isMonorepoPackageRef,
  detectMonorepo,
  bootstrapMonorepo,
  installDependencies,
  createPackage,
  findTarball,
  findSpecificVersion,
  findLatestVersion,
  isLocalPackage,
  makeGitUrl,
  makeFilePath,
  getCurrentPackageDetails,
  isLinkedPackage,
  combinePackageRef,
  getPackageName,
  getFilePackageVersion,
  getGitPackageVersion,
  getPackageVersion,
  isGitPackage,
} from './npm';

jest.mock('child_process');

jest.mock('../external', () => ({
  rc() {},
  logger: {
    stopSpinner() {},
    verbose() {},
    info() {},
    error() {},
    log() {},
    setOptions() {},
  },
}));

const jsonValueString = JSON.stringify({ dependencies: { npm: { extraneous: true } } });
jest.mock('./scripts', () => ({
  runCommand: (exe: string, args: Array<string>, cwd: string, output?: NodeJS.WritableStream) => {
    return new Promise<void>((resolve, reject) => {
      output?.write(jsonValueString, () => {});
      resolve();
    });
  },
}));

jest.mock('fs', () => ({
  constants: {
    F_OK: 1,
  },
  exists: (file: string, cb: (status: boolean) => void) => cb(!file.endsWith('package.json')),
  existsSync: (file: string) => {
    return true;
  },
  readFile: (file: string, type: string, callback: (err: NodeJS.ErrnoException, data: string) => void) => {
    return callback(null, '');
  },
  readFileSync: () => '',
  access: (path: string, mode: number, callback: any) => {
    return callback(null);
  },
}));

describe('NPM Module', () => {
  it('dissects a fully qualified name with latest correctly', async () => {
    const [name, version, hadVersion, type] = await dissectPackageName(process.cwd(), 'foo@latest');
    expect(hadVersion).toBe(true);
    expect(version).toBe('latest');
    expect(name).toBe('foo');
    expect(type).toBe('registry');
  });

  it('dissects a fully qualified name  with a specific version correctly', async () => {
    const [name, version, hadVersion, type] = await dissectPackageName(process.cwd(), 'foo@1.2.3');
    expect(hadVersion).toBe(true);
    expect(version).toBe('1.2.3');
    expect(name).toBe('foo');
    expect(type).toBe('registry');
  });

  it('dissects a simple name correctly', async () => {
    const [name, version, hadVersion, type] = await dissectPackageName(process.cwd(), 'foo');
    expect(hadVersion).toBe(false);
    expect(version).toBe('latest');
    expect(name).toBe('foo');
    expect(type).toBe('registry');
  });

  it('dissects a relative file name correctly', async () => {
    const [name, version, hadVersion, type] = await dissectPackageName('/home/yolo', '../foo/bar');
    expect(hadVersion).toBe(false);
    expect(version).toBe('latest');
    expect(name).toBe(resolve('/home/yolo', '../foo/bar'));
    expect(type).toBe('file');
  });

  it('dissects an absolute file name correctly', async () => {
    const [name, version, hadVersion, type] = await dissectPackageName('/home/yolo', '/foo/bar');
    expect(hadVersion).toBe(false);
    expect(version).toBe('latest');
    expect(name).toBe(resolve('/home/yolo', '/foo/bar'));
    expect(type).toBe('file');
  });

  it('dissects a git SSH repo name correctly', async () => {
    const [name, version, hadVersion, type] = await dissectPackageName(process.cwd(), 'ssh://foo-bar.com/foo.git');
    expect(hadVersion).toBe(false);
    expect(version).toBe('latest');
    expect(name).toBe('git+ssh://foo-bar.com/foo.git');
    expect(type).toBe('git');
  });

  it('dissects a git HTTPS repo name correctly', async () => {
    const [name, version, hadVersion, type] = await dissectPackageName(process.cwd(), 'https://foo-bar.com/foo.git');
    expect(hadVersion).toBe(false);
    expect(version).toBe('latest');
    expect(name).toBe('git+https://foo-bar.com/foo.git');
    expect(type).toBe('git');
  });

  it('dissects a scoped name correctly', async () => {
    const [name, version, hadVersion, type] = await dissectPackageName(process.cwd(), '@foo/bar');
    expect(hadVersion).toBe(false);
    expect(version).toBe('latest');
    expect(name).toBe('@foo/bar');
    expect(type).toBe('registry');
  });

  it('dissects a scoped fully qualified name with latest correctly', async () => {
    const [name, version, hadVersion, type] = await dissectPackageName(process.cwd(), '@foo/bar@latest');
    expect(hadVersion).toBe(true);
    expect(version).toBe('latest');
    expect(name).toBe('@foo/bar');
    expect(type).toBe('registry');
  });

  it('dissects a scoped fully qualified name  with a specific version correctly', async () => {
    const [name, version, hadVersion, type] = await dissectPackageName(process.cwd(), '@foo/bar@^1.x');
    expect(hadVersion).toBe(true);
    expect(version).toBe('^1.x');
    expect(name).toBe('@foo/bar');
    expect(type).toBe('registry');
  });

  it('installs a package using the NPM command line tool without a target', async () => {
    await installPackage('npm', 'foo', 'latest').then(result => expect(result).toEqual(jsonValueString));
  });

  it('installs a package using the NPM command line tool without a version', async () => {
    await installPackage('npm', 'foo').then(result => expect(result).toEqual(jsonValueString));
  });

  it('installs a package using the Yarn command line tool without a version', async () => {
    await installPackage('yarn', 'foo').then(result => expect(result).toEqual(jsonValueString));
  });

  it('installs a package using the Pnpm command line tool without a version', async () => {
    await installPackage('pnpm', 'foo').then(result => expect(result).toEqual(jsonValueString));
  });

  it('installs a package using the NPM command line tool with some flag', async () => {
    await installPackage('npm', 'foo', '1.3', '.', '--a=b').then(result => expect(result).toEqual(jsonValueString));
  });

  it('detectNpm finds package-lock.json', async () => {
    await detectNpm('test').then(result => expect(result).toBeTruthy());
  });

  it('detectPnpm finds nppm-lock.yaml', async () => {
    await detectPnpm('test').then(result => expect(result).toBeTruthy());
  });

  it('detectYarn finds yarn.lock', async () => {
    await detectYarn('test').then(result => expect(result).toBeTruthy());
  });

  it('uses npm to verify whether a particular package is included in monorepo package', async () => {
    await isMonorepoPackageRef('npm', './').then(result => expect(result).toBeTruthy());
  });

  it('verfiies whether lerna config path is valid', async () => {
    await detectMonorepo('./').then(result => {
      console.log(`result: ${result}`);
      expect(result).toBeTruthy();
    });
  });

  it('verfiies whether lerna bootstrap ran', async () => {
    await bootstrapMonorepo().then(result => expect(result).toEqual(jsonValueString));
  });

  it('install dependencies with npm client', async () => {
    await installDependencies('npm').then(result => expect(result).toEqual(jsonValueString));
  });

  it('install dependencies with pnpm client', async () => {
    await installDependencies('pnpm').then(result => expect(result).toEqual(jsonValueString));
  });

  it('install dependencies with yarn client', async () => {
    await installDependencies('yarn').then(result => expect(result).toEqual(jsonValueString));
  });

  it('create npm package', async () => {
    await createPackage().then(result => expect(result).toEqual(jsonValueString));
  });

  it('find npm tarball', async () => {
    await findTarball('foo').then(result => expect(result).toEqual(jsonValueString));
  });

  it('find latest version', async () => {
    await findLatestVersion('foo').then(result => expect(result).toEqual(jsonValueString));
  });

  it('find specific version', async () => {
    await findSpecificVersion('foo', '1.0.0').then(result => expect(result).toEqual(jsonValueString));
  });

  it('check if package is local', () => {
    let result = isLocalPackage('./', 'file://foo.tgz');
    expect(result).toBeTruthy();
    result = isLocalPackage('./', './');
    expect(result).toBeTruthy();
    result = isLocalPackage('./', 'foo.tgz');
    expect(result).toBeTruthy();
    result = isLocalPackage('./', null);
    expect(result).toBeFalsy();
  });

  it('check if package is coming from git', () => {
    let result = isGitPackage('https://.foo.git');
    expect(result).toBeTruthy();
    result = isGitPackage('git+');
    expect(result).toBeTruthy();
    result = isGitPackage(null);
    expect(result).toBeFalsy();
  });

  it('makeGitUrl returns valid git url', () => {
    let result = makeGitUrl('git+https://.foo.git');
    expect(result).toEqual('git+https://.foo.git');
    result = makeGitUrl('https://.foo.git');
    expect(result).toEqual('git+https://.foo.git');
  });

  it('makeFilePath returns valid file path', () => {
    let result = makeFilePath('/', 'file:/foo.tgz');
    expect(result).toEqual('file:/foo.tgz');
    result = makeFilePath(resolve('./test', ''), 'foo.tgz');
    const path = resolve('./test', 'foo.tgz');
    expect(result).toEqual(`file:${path}`);
  });

  it('verify whether package is linked', () => {
    let result = isLinkedPackage('foo', 'registry', false);
    expect(result).toBeFalsy();
    result = isLinkedPackage('foo', 'file', false);
    expect(result).toBeFalsy();
    result = isLinkedPackage('foo', 'git', false);
    expect(result).toBeFalsy();
  });

  it('combine package refernce', () => {
    let result = combinePackageRef('foo', '1.0.0', 'registry');
    expect(result).toBe('foo@1.0.0');
    result = combinePackageRef('foo', null, 'registry');
    expect(result).toBe('foo@latest');
    result = combinePackageRef('foo', null, 'file');
    expect(result).toBe('foo');
    result = combinePackageRef('foo', null, 'git');
    expect(result).toBe('foo');
  });

  it('retrieve package name', () => {
    let result = getPackageName('./', 'foo', 'file');
    expect(result).toBeInstanceOf(Promise);
    result.then(message => expect(message).toBeUndefined());
    result = getPackageName('./', 'foo', 'git');
    expect(result).toBeInstanceOf(Promise);
    result.then(message => expect(message).toBeUndefined());
    result = getPackageName('./', 'foo', 'registry');
    expect(result).toBeInstanceOf(Promise);
    result.then(name => expect(name).toEqual('foo'));
  });

  it('gets path to file package', () => {
    let result = getFilePackageVersion('./test/foo.tgz', './');
    expect(result).toEqual('file:test/foo.tgz');
  });

  it('gets path to git package', () => {
    let result = getGitPackageVersion('git+https://.foo.git');
    expect(result).toEqual('git+https://.foo.git');
  });

  it('get version of package', () => {
    let result = getPackageVersion(true, 'foo', '1.0.0', 'registry', './');
    expect(result).toEqual('1.0.0');
    result = getPackageVersion(false, 'foo', '1.0.0', 'registry', './');
    expect(result).toBeFalsy();
    result = getPackageVersion(true, './foo.tgz', null, 'file', './');
    expect(result).toEqual('file:foo.tgz');
    result = getPackageVersion(true, 'git+https://.foo.git', null, 'git', null);
    expect(result).toEqual('git+https://.foo.git');
  });

  it('gets path to git package', () => {
    let result = getCurrentPackageDetails('./', './foo.tgz', null, 'file://foo.tgz', './');
    result.then(([path, version]) => {
      expect(path).not.toBeUndefined();
    });
    let result2 = getCurrentPackageDetails('./', './foo.tgz', null, 'git+https://.foo.git', './');
    result2.then(([path, version]) => {
      expect(path).not.toBeUndefined();
    });
    let result3 = getCurrentPackageDetails('./', './foo.tgz', '1.0.0', 'latest', './');
    result3.then(([path, version]) => {
      expect(path).toEqual('./foo.tgz@latest');
      expect(version).toEqual('latest');
    });
  });
});