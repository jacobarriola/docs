/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-var-requires */
const { globSync } = require('glob');
const fs = require('fs');
const reader = require('xlsx');

// get list of all files currently in pages-old
const oldPages = globSync('src/pages-old/**/*.mdx');

// remove all ChooseFilterPages
oldPages.forEach((file) => {
  fs.readFile(file, 'utf8', (err, data) => {
    if (err) console.log(err);
    if (data.startsWith('import ChooseFilterPage')) {
      fs.rm(file, (err) => {
        if (err) console.log(err);
      });
    }
  });
});

// get file data from Excel doc
const excelFile = reader.readFile(
  '/Users/katiegoi/katiegoines/docs/IA Migration combined (2).xlsm'
);

// exclude worksheets without migration data
const excelData = [];
const sheets = excelFile.SheetNames;
sheets.forEach((sheet) => {
  if (
    sheet != 'Samsara Pages' &&
    sheet != 'Naming Conventions' &&
    sheet != 'Validation lists'
  ) {
    const temp = reader.utils.sheet_to_json(excelFile.Sheets[sheet]);
    temp.forEach((res) => {
      excelData.push(res);
    });
  }
});

// filter out pages that aren't being migrated (no Original backend source || no New backend source)
const migrationData = [];
excelData.forEach((item) => {
  if (
    item['Original backend source'] != 'N/A' &&
    item['Original backend source'] != 'N/a' &&
    item['New backend source'] != 'N/A' &&
    item['New backend source'] != 'N/a' &&
    item['Classic or Samsara?'] == 'Classic'
  ) {
    migrationData.push(item);
  }
});

// compare migration data provided with existing pages in pages-old
const notAccountedForInMigrationDoc = [];
const inMigrationDocNotInPagesOld = [];
const pagesThatWillMigrate = [];
const excelDataOrigSource = [];
const excelDataNewSource = [];

migrationData.forEach((item) => {
  let itemSource = item['Original backend source'];
  itemSource = itemSource.replace('pages', 'pages-old');
  excelDataOrigSource.push(itemSource);
  excelDataNewSource.push(item['New backend source']);

  if (!oldPages.includes(itemSource)) {
    inMigrationDocNotInPagesOld.push(itemSource);
  }
});

oldPages.forEach((path) => {
  if (!excelDataOrigSource.includes(path)) {
    notAccountedForInMigrationDoc.push(path);
  } else {
    pagesThatWillMigrate.push(path);
  }
});

// console.log(oldPages.length, excelDataOrigSource.length);
// console.log(notAccountedForInMigrationDoc, inMigrationDocNotInPagesOld);

// log pages that are not accounted for in migration excel doc
// console.log('pages not accounted for in migration doc but that exist in pages-old file structure:', notAccountedForInMigrationDoc);
// console.log('pages that are found in pages-old structure and are notated in the excel for migration:', pagesThatWillMigrate);

// change all 'Original backend source' to 'pages-old'
migrationData.forEach((item) => {
  const origSource = item['Original backend source'];
  const oldPath = origSource.replace('pages', 'pages-old');
  item['Original backend source'] = oldPath;
});

// combine multiple Excel entries for pages that have same 'New backend source' and set platform array
migrationData.forEach((item) => {
  const multiples =
    excelDataNewSource.filter((path) => {
      return path == item['New backend source'];
    }).length > 1;

  let platforms = [];
  if (multiples) {
    const toCombine = migrationData.filter((item2) => {
      return item['New backend source'] == item2['New backend source'];
    });

    for (let i = 0; i < toCombine.length; i++) {
      toCombine[i]['Platform specific'] = toCombine[i]['Platform specific']
        .toLowerCase()
        .replace(' (web)', '')
        .replace('.js', '')
        .replace('react native', 'react-native');

      platforms.push(toCombine[i]['Platform specific']);

      if (i != 0) {
        migrationData.splice(migrationData.indexOf(toCombine[i]), 1);
      }
    }
  } else {
    item['Platform specific'] = item['Platform specific']
      .toLowerCase()
      .replace(' (web)', '')
      .replace('.js', '')
      .replace('react native', 'react-native');
    platforms.push(item['Platform specific']);
  }
  platforms = platforms.filter((value, index) => {
    return platforms.indexOf(value) === index;
  });
  item['Platform specific'] = platforms;
});

// console.log(migrationData);

// Update meta and imports for all pages accounted for in Excel file
migrationData.forEach((page) => {
  fs.readFile(page['Original backend source'], 'utf8', (err, data) => {
    if (err) {
      console.log(err);
    } else {
      data = data.split('\n');
      let exportIndex = '';
      data.forEach((line) => {
        if (line.includes('title: ')) {
          data.splice(data.indexOf(line), 1, `  title: \`${page['Page']}\`,`);
        } else if (line.includes('supportedPlatforms:')) {
          exportIndex = data.indexOf(line);
          data.splice(
            data.indexOf(line),
            1,
            `  platforms: [ ${page['Platform specific']} ]`
          );
        } else if (line.includes('filterKey:')) {
          data.splice(data.indexOf(line), 1, '<remove empty line>');
        } else if (line.includes('import { generateStaticPaths }')) {
          data.splice(data.indexOf(line), 1, '<remove empty line>');
        } else if (line.includes('export const getStaticPaths')) {
          data.splice(data.indexOf(line), 4, '<remove empty line>');
        } else if (line.includes('export const getStaticProps')) {
          data.splice(data.indexOf(line), 9, '<remove empty line>');
        }
      });

      const importToAdd = `import { getCustomStaticPath } from '@/utils/getCustomStaticPath';
      `;
      const exportToAdd = `export const getStaticPaths = async () => {
  return getCustomStaticPath(meta.platforms);
};
      
export function getStaticProps(context) {
  return {
    props: {
      platform: context.params.platform,
      meta
    }
  };
}`;
      data.splice(exportIndex + 4, 0, exportToAdd);
      data.unshift(importToAdd);

      data = data.filter((lines) => {
        return lines != '<remove empty line>';
      });

      const newFile = data.join('\n');

      fs.writeFile(data, newFile, () => {
        if (err) console.log(err);
      });

      //       const filterKeyLine = '\n  filterKey: "integration",';
      //       const supportedPlatforms = '  supportedPlatforms:';
      //       const generateStaticPaths = `import { generateStaticPaths } from "@/utils/generateStaticPaths.tsx";\n\n`;
      //       const getStaticPaths = `
      // export const getStaticPaths = () => {
      //   return generateStaticPaths(meta.filterKey, meta.supportedPlatforms);
      // };
      //       `;
      //       const getStaticProps = `export const getStaticProps = (context) => {
      //       return {
      //           props: {
      //               integration: context.params.integration,
      //               filterKind: meta.filterKey
      //           }
      //       };
      //   };
      //   `;
      //       console.log(getStaticPaths);
      //       data = data
      //         .replace(filterKeyLine, '')
      //         .replace(supportedPlatforms, '  platforms:')
      //         .replace(generateStaticPaths, '')
      //         .replace(getStaticPaths, '')
      //         .replace(getStaticProps, '');

      //       console.log(data);

      // data = data.split('\n');
      // console.log(data);

      // const contentArray = data.split('\n');
      // contentArray.forEach((line) => {
      //   if (line.includes('filterKey: "')) {
      //     contentArray.splice(contentArray.indexOf(line), 1);
      //   }
      //   if (line.includes('supportedPlatforms:')) {
      //     const revLine = line.replace('supportedPlatforms: ', 'platforms: ');
      //     line = revLine; // unsure if this is setting correctly
      //   }
      // });
      // if (data[0].includes('export const meta')) {
      //   console.log(data[0]);
      // }
      // const meta = data.indexOf('export const meta = {');
      // if (meta != -1) {
      //   console.log(data);
      // }
      // console.log(data[0], '\n', '--------');
      // console.log(
      //   revised,
      //   '\n',
      //   '----------------------------------------------------------------'
      // );
    }
  });
});

// create necessary directories exist in 'pages' for each file path
// migrationData.forEach((item) => {
//   const newPath = item['New backend source'];
//   const dirPath = newPath.slice(0, newPath.lastIndexOf('/'));

//   if (!fs.existsSync(dirPath)) {
//     fs.mkdir(dirPath, { recursive: true }, (err) => {
//       if (err) throw err;
//     });
//     console.log('folder structure created for: ', dirPath);
//   }
// });

// move existing pages from pages-old into new IA locations
// migrationData.forEach((item) => {
//   // console.log(origSource, '-->', oldPath);
//   if (fs.existsSync(oldPath)) {
//     // console.log(oldPath);
//     // fs.rename(oldPath, item['New backend source'], (err) => {
//     //   if (err) {
//     //     console.log(item['New backend source'], err);
//     //   } else {
//     //     console.log(
//     //       'rename successful: ',
//     //       oldPath,
//     //       '-->',
//     //       item['New backend source']
//     //     );
//     //   }
//     // });
//   } else {
//     // console.log('file already moved:', oldPath);
//   }

// change content of migrated pages - new meta structure and imports
// fs.readFile(item['New backend source'], 'utf8', (err, data) => {
//   if (err) console.log(err)
//   // console.log(data)
// });
// });

// remove all ChooseFilterPages from pages-old
// glob('src/pages-old/**/*.mdx').then((files) => {
//   files.forEach((firstFile) => {
//     fs.readFile(firstFile, 'utf8', (err, data) => {
//       if (err) console.log(err);
//       if (data.startsWith('import ChooseFilterPage')) {
//         fs.rm(firstFile, (err) => {
//           console.log(err);
//         });
//       }
//     });
//   });
//   // list remaining pages in pages-old structure
//   // console.log('files remaining in pages-old: ', files);
// });

// remove empty directories from pages-old
// glob('src/pages-old/**/').then((directories) => {
//   directories.forEach((directory) => {
//     fs.readdir(
//       directory,
//       { encoding: 'utf8', recursive: true },
//       (err, files) => {
//         if (err) {
//           console.log(err);
//         } else {
//           if (!files.length) {
//             fs.rmdir(directory, { recursive: true }, (err) => {
//               if (err) console.log(err);
//             });
//           }
//         }
//       }
//     );
//   });
//   // console.log('remaining directories:', directories);
// });

// change content of migrated pages - new meta structure and imports
// glob('src/pages/**/*.mdx').then((files) => {
//   // const platPages = files.filter((file) => {
//   //   file.startsWith('src/pages/gen2');
//   // });
//   // console.log(platPages)
//   files.forEach((firstFile) => {
//     if (!firstFile.startsWith('src/pages/gen2/')) {
//       // console.log(firstFile)
//       fs.readFile(firstFile, 'utf8', (err, data) => {
//         if (err) console.log(err);
//         if (data) {
//           data = data.split('\n');
//           const meta = data['export const meta'];
//           // console.log(data);

//           if (
//             !data.includes(
//               "import { getCustomStaticPath } from '@/utils/getCustomStaticPath';"
//             )
//           ) {
//             // console.log(data);
//           }
//         }
//         // console.log(
//         //   '-----------------------------------------------',
//         //   firstFile,
//         //   '---------------------------------------'
//         // );

//         // console.log(data);
//         // console.log(
//         //   '----------------------------------------------- end page ---------------------------------------'
//         // );
//       });
