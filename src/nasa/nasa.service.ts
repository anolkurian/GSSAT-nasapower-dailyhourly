import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as turf from '@turf/turf';
import * as shapefile from 'shapefile';
import * as gdal from 'gdal-next';

import readline from 'readline';
import { promisify } from 'util';


interface LatLon {
  nasapid: string;
  lat: number;
  lon: number;
}
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

@Injectable()
export class NasaService {
  private baseDir = 'C:/ANOL/OPS_RA/GSSAT/nasa-power/basedir';

  constructor() {
    this.createDirectories();
  }

  private createDirectories() {
    ['Join', 'weather-files', 'weather-refs'].forEach((dir) => {
      if (!fs.existsSync(path.join(this.baseDir, dir))) {
        fs.mkdirSync(path.join(this.baseDir, dir));
      }
    });
  }

  private async fetchAndProcessData(nasapid: string, lat: number, lon: number) {
    const startDate = '20010101';
    const endDate = new Date().toISOString().split('T')[0].replace(/-/g, '');

    const hourlyUrl = `https://power.larc.nasa.gov/api/temporal/hourly/point?start=${startDate}&end=${endDate}&latitude=${lat}&longitude=${lon}&community=ag&parameters=RH2M&format=csv&header=true&time-standard=lst`;
    const dailyUrl = `https://power.larc.nasa.gov/api/temporal/daily/point?start=${startDate}&end=${endDate}&latitude=${lat}&longitude=${lon}&community=ag&parameters=T2MDEW%2CT2M_MIN%2CT2M_MAX%2CRH2M%2CPRECTOTCORR%2CWS2M%2CALLSKY_SFC_SW_DWN&format=icasa&header=true&time-standard=lst`;

    const hourlyFilePath = path.join(this.baseDir, 'Join', 'hourly.csv');
    const dailyFilePath = path.join(this.baseDir, 'Join', 'daily.WTH');
    const outputFilePath = path.join(this.baseDir, 'weather-files', `${nasapid}.WTH`);

    try {
      // Fetch hourly data
      const hourlyResponse = await axios.get(hourlyUrl, { responseType: 'stream' });
      // Pipe the data to the hourly file
      await new Promise((resolve, reject) => {
        hourlyResponse.data.pipe(fs.createWriteStream(hourlyFilePath))
          .on('finish', resolve)
          .on('error', reject);
      });

      // Fetch daily data
      const dailyResponse = await axios.get(dailyUrl, { responseType: 'stream' });
      // Pipe the data to the daily file
      await new Promise((resolve, reject) => {
        dailyResponse.data.pipe(fs.createWriteStream(dailyFilePath))
          .on('finish', resolve)
          .on('error', reject);
      });

      console.log('Data fetching completed successfully');
    } catch (error) {
      console.error('Error fetching data:', error.message);
      console.error('Stack trace:', error.stack);
    }

    // Process hourly.csv to create rh90.txt equivalent
    const hourlyData = fs.readFileSync(hourlyFilePath, 'utf-8').split('\n').slice(9);
    const rh90Map: { [date: string]: number } = {};

    try {
      hourlyData.forEach((line) => {
        if (!line.trim()) {
          console.log('Skipping empty line');
          return;
        }
        const [YEAR, MO, DY, , RH2M] = line.split(',');

        // Ensure that the expected fields exist before processing
        if (!YEAR || !MO || !DY || RH2M === undefined) {
          console.warn('Skipping malformed line:', line);
          return;
        }

        const date = `${YEAR}${MO.padStart(2, '0')}${DY.padStart(2, '0')}`;
        if (!rh90Map[date]) rh90Map[date] = 0;
        if (parseFloat(RH2M) >= 90) rh90Map[date] += 1;
      });
    } catch (error) {
      console.error('Error processing hourly data:', error.message);
      console.error('Stack trace:', error.stack);
    }

    console.log("here")
    try {
      // Read the contents of the daily file asynchronously
      const dailyFileContent = await readFile(dailyFilePath, 'utf-8');
      const lines = dailyFileContent.split('\n');
      const outputLines: string[] = [];

      // Process each line in the daily file
      lines.forEach((line) => {
        if (line.includes('@  DATE')) {
          const cleanLine = line.replace(/\r/g, '');
          outputLines.push(`${cleanLine}    RH90`);
        } else {
          const parts = line.split(/\s+/);
          if (parts.length > 0) {
            const yyyyddd = parts[0];

            // Validate yyyyddd format
            if (/^\d{7}$/.test(yyyyddd)) { // Check if it is 7 digits long
              const year = parseInt(yyyyddd.slice(0, 4), 10);
              const dayOfYear = parseInt(yyyyddd.slice(4), 10);

              // Validate year and day of year
              if (year > 0 && dayOfYear >= 1 && dayOfYear <= 366) {
                // Create a new Date object for the first day of the year
                const date = new Date(year, 0, dayOfYear);

                // Format the date as yyyymmdd
                const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, '');

                // Retrieve the RH90 value using the formatted date
                const rh90 = rh90Map[formattedDate] ? rh90Map[formattedDate].toString().padStart(7, ' ') : '0'.padStart(7, ' ');
                const cleanLine = line.replace(/\r/g, '');
                outputLines.push(`${cleanLine}${rh90}`);
              } else {
                console.warn(`Invalid day of year (${dayOfYear}) in line: ${line}`);
              }
            } else {
              console.warn(`Invalid yyyyddd format (${yyyyddd}) in line: ${line}`);
            }
          } else {
            console.warn('Line does not contain yyyyddd value:', line);
          }
        }
      });

      // Write the processed lines to the output file asynchronously
      await writeFile(outputFilePath, outputLines.join('\n'), 'utf-8');

      console.log('Data processing completed successfully');
    } catch (error) {
      console.error('Error processing data:', error.message);
      console.error('Stack trace:', error.stack);
    }

    // Update daily.WTH with RH90


    console.log(`Processed data written to ${outputFilePath}`);
  }

  async syncData() {
    // Read the shapefile and crop area

    await this.fetchAndProcessData('example1', -28, -51);

    // Simulate the sed command
    fs.readdirSync(path.join(this.baseDir, 'weather-files')).forEach(file => {
      const filePath = path.join(this.baseDir, 'weather-files', file);
      const content = fs.readFileSync(filePath, 'utf8');
      const updatedContent = content.replace(/\$WEATHER/g, '*WEATHER');
      fs.writeFileSync(filePath, updatedContent);
    });

    return 'Data synchronization completed.';
  }

  private cropShape(nasaidSoils, shapefile) {
    // Implement the cropping logic here
    // For demonstration purposes, return a dummy cropped shape
    return [
      { nasapid: 'example1', LatNP: -28, LonNP: -51, ID: 'id1' },
      { nasapid: 'example2', LatNP: -27, LonNP: -50, ID: 'id2' },
    ];
  }
}
