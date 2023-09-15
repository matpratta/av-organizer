# AV Organizer

This small utility is intended to be used to organize photos and videos by type (Image, Video, Audio, Other) and date. It's an refined version of my other project, [Organizr](https://github.com/matpratta/organizr).

Files are organized by date taken (if available) or modified at. Files with any name before the first dot are grouped together (DSC0001.jpg, DSC0001.dng, DSC0001.edited.jpg would all be grouped into the same directory).

## Installation

Clone this repo locally and run `npm install && npm link` to install all dependencies and link it to your command-line.

## Usage

To get a preview of what files are going to be moved where, run the command `av-organizer`. To actually move files, run `av-organizer move`.