#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mime = require('mime');
const exif = require('exifr');
const cliProgress = require('cli-progress');

let progress = null;
function tickProgress() {
  if (progress) {
    progress.increment();
  }
}

function createDirectoryIfNotExisting(path) {
  if (fs.existsSync(path)) return;
  return fs.promises.mkdir(path);
}

function isValidFile(filePath) {
  // We may want to ignore a few file names
  if (
    '._' == path.basename(filePath).substring(0, 2) ||
  [
    '.DS_Store',
    ].includes(path.basename(filePath))
  ) {
    return false;
  }

  // Ignore directories
  if (fs.statSync(filePath).isDirectory()) {
    return false;
  }

  // We're good
  return true;
}

async function getFileInfo(filePath) {
  const mimeType = mime.getType(filePath);
  const baseType = mimeType?.split('/').shift();
  const splitName = path.basename(filePath).split('.');

  const fileStat = await fs.promises.stat(filePath);
  const fileCreatedAt = fileStat.ctime;
  const fileModifiedAt = fileStat.mtime;
  let fileTakenAt = null;

  // For certain file types, let's extract the taken date instead of modified at
  if (['image/jpeg', 'image/tiff'].includes(mimeType)) {
    const fileData = await fs.promises.readFile(filePath);
    const exifData = await exif.parse(fileData);
    fileTakenAt = exifData.DateTimeOriginal || null;
  }

  // Updates overall progress for better UX
  tickProgress();

  return {
    name: splitName.shift(),
    basename: path.basename(filePath),
    extension: splitName.pop(),
    path: filePath,
    mime: mimeType,
    type: baseType,
    takenAt: fileTakenAt,
    createdAt: fileCreatedAt,
    modifiedAt: fileModifiedAt,
  }
}

async function main(command) {
  const CWD = process.cwd();

  // Reads the current directory, takes the files and groups them by extension
  const baseFiles = (await fs.promises.readdir(CWD))
    .map(fileName => path.join(CWD, fileName))
    .filter(isValidFile);

  // Let's create a progress bar for better UX
  console.log('Extracting file information...');
  progress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  progress.start(baseFiles.length, 0);

  // Extracts file information, this may take some time since some files may be read from disk
  const baseFilesInfo = await Promise.all(
    baseFiles
      .map(filePath => getFileInfo(filePath))
  );

  progress.stop();

  // Now, let's group all our files
  const files = {};
  baseFilesInfo.forEach(fileInfo => {
    // Creates the file list for that name
    if (!files[fileInfo.name]) {
      files[fileInfo.name] = [];
    }

    // Adds current file to organized list
    files[fileInfo.name].push(fileInfo);
  });

  // Processes our groups
  const filesPerTypeAndDate = {};
  const filesForInformation = [];
  for (let name in files) {
    const fileInfos = files[name];

    // Extracts the group main filetype (if none, uses "other")
    const groupType = fileInfos
      .filter(fileInfo => ['image', 'audio', 'video'].includes(fileInfo.type))
      .map(fileInfo => fileInfo.type)
      .shift() || 'other';

    // Extracts the group date
    const groupDate = fileInfos
      .map(fileInfo => fileInfo.takenAt || fileInfo.modifiedAt)
      .sort()
      .shift();

    // Creates listing
    const dateString = groupDate.toISOString().split('T').shift();
    if (!filesPerTypeAndDate[groupType]) {
      filesPerTypeAndDate[groupType] = {};
    }
    if (!filesPerTypeAndDate[groupType][dateString]) {
      filesPerTypeAndDate[groupType][dateString] = [];
    }
    filesPerTypeAndDate[groupType][dateString].push(
      ...fileInfos,
    );

    // Generates info table row
    fileInfos.forEach(
      fileInfo => filesForInformation.push({
        File: `${fileInfo.basename}`,
        Class: groupType,
        Date: dateString,
      })
    );
  }

  // Prints table with information about the files being moved
  console.table(filesForInformation);

  // Handles cases where no "move" command has been passed
  if ('move' !== command) {
    console.log('To actually move the files, add the "move" command.');
    return 0;
  }

  // Those are used to track which directory we'll use for each type
  console.log('Moving files...');
  const typeDirNames = {
    image: 'Image',
    video: 'Video',
    audio: 'Audio',
    other: 'Other',
  };
  
  // Create type directories
  await Promise.all(
    Object.keys(filesPerTypeAndDate).map(
      type => createDirectoryIfNotExisting(path.join(CWD, typeDirNames[type] || 'Other'))
    )
  );

  // Starts progress bar again, for UX
  progress.start(filesForInformation.length, 0);
  
  // Does actual moving
  for (const type in filesPerTypeAndDate) {
    const dirType = path.join(CWD, typeDirNames[type] || 'Other');
    await Promise.all(
      Object.keys(filesPerTypeAndDate[type]).map(date => (async () => {
        const dirDate = path.join(dirType, date);
        const dirFiles = filesPerTypeAndDate[type][date];
        await createDirectoryIfNotExisting(dirDate);

        for (const fileInfo of dirFiles) {
          await fs.promises.rename(fileInfo.path, path.join(dirDate, fileInfo.basename));
          progress.increment();
        }
      })())
    );
  }

  // Lets the user know we're done
  progress.stop();
  console.log('Files organized successfully!');
  return 0;
}

// Invokes our main entry-point, passes all relevant arguments and handles its return code
main(...process.argv.slice(2)).then(
  code => process.exit(code || 0)
);