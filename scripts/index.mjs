import { NotionAPI } from "notion-client"
import { renderNotionPage } from './render/renderToHtmlString.js'
// export declare type BlockType = 'page' | 'text' | 'bookmark' | 'bulleted_list' | 'numbered_list' | 'header' | 'sub_header' | 'sub_sub_header' | 'quote' | 'equation' | 'to_do' | 'table_of_contents' | 'divider' | 'column_list' | 'column' | 'callout' | 'toggle' | 'image' | 'embed' | 'gist' | 'video' | 'figma' | 'typeform' | 'codepen' | 'excalidraw' | 'tweet' | 'maps' | 'pdf' | 'audio' | 'drive' | 'file' | 'code' | 'collection_view' | 'collection_view_page' | 'transclusion_container' | 'transclusion_reference' | 'alias' | 'table' | 'table_row' | 'external_object_instance' | string;
import path from 'path'
import fs from 'fs'
import AdmZip from 'adm-zip'

// npm run run-backup blockids "3c2614e58cf64399b5b561e873ef61e5, 26c9e464186648c38160ed5b8e5a3277"

console.log('-----notion backup start-----', process.argv)
console.log('reading notion block id from your cmd argv ...')

const isDev = process.env.NODE_ENV === 'development'

if (!isDev && !process.argv[2]) {
  throw 'can not get notion block id!'
}

// 测试 notion page id：917c1456eb6b472590f3611fb57b691c（子页面不是直接子页面，而是其他页面的链接）

const blockIdArr = isDev ? ['713b6661d9904d57a1b310ef334257c0'] : process.argv[2].split(',').map(id => id.trim())

console.log('this is notion block id you want to back up:\n')
console.log(blockIdArr)

const NC2 = new NotionAPI()

function pureBlockId(blockId) {
  return blockId.replaceAll('-', '')
}

let failPageIdArr = []
async function backupNotionPage(parentDir = '', blockId) {
  let res2
  try {
    res2 = await NC2.getPage(blockId, { fetchCollections: true })
  } catch (err) {
    failPageIdArr.push(blockId.replaceAll('-', ''))
    throw 'page fetch error'
  }
  // blockId === '713b6661d9904d57a1b310ef334257c0' &&
  // fs.writeFileSync(path.resolve(__dirname, '../log' + `/res${blockId}.json`), JSON.stringify(res2))
  // console.log({res2})
  const dirPath = `${parentDir}/${pureBlockId(blockId)}`
  fs.mkdirSync(dirPath, { recursive: true })
  const { htmlStr, childPages: childPagesId } = renderNotionPage(dirPath, res2, blockId)
  fs.writeFileSync(`${dirPath}/index.html`, htmlStr)
  // console.log(
  //   {
  //     blockId,
  //     childPagesId
  // })

  if (childPagesId.length > 0) {
    // console.log({
    //   'childPagesId length': childPagesId.length,
    //   childPagesId
    // })
    const childDir = `${dirPath}/childPages`
    fs.mkdirSync(childDir, { recursive: true })
    await Promise.allSettled( // 不能用 Promise.all，不能因为有一个 page 解析失败而影响后面全部的 page
      childPagesId.map(id => {
        return backupNotionPage(childDir, id.replaceAll('-', ''))
      })
    )
  }
  return blockId
}

const backupDir = path.resolve(__dirname, '../backup')

async function zipBackupDir() {
  const now = new Date()
  const zip = new AdmZip()
  fs.mkdirSync( path.resolve(__dirname, `../backupZip`))
  const zipPath = path.resolve(__dirname, `../backupZip/backup-notion-${now.getTime()}.zip`)
  zip.addLocalFolder(backupDir)
  zip.writeZip(zipPath)
}


Promise.allSettled(
  blockIdArr.map(id => {
    try {
      return backupNotionPage(backupDir, id)
    } catch (err) {
      console.log(err)
      return id
    }
  })
).then(resultArr => {
  console.log('backup done')
  isDev && console.log(resultArr)
  const successIds = resultArr.filter(({ status, value }) => {
    return status === 'fulfilled'
  }).map(i => i.value)
  const failIds = []
  blockIdArr.forEach(id => {
    if (!successIds.includes(id)) {
      failIds.push(id)
    }
  })
  console.table([{
    'backup success block id': successIds,
    'backup failed block id': failIds
  }])
  failPageIdArr.length > 0 &&
  console.log(
    'these pages backup failed, they are probably removed from notion: \n',
    failPageIdArr,
    '\n',
    `you can try visit notion page with these page id, like this: https://www.notion.so/${failPageIdArr[0]}`
  )
  zipBackupDir(backupDir)
}).catch(err => {
  console.error('fail~~', err)
})

