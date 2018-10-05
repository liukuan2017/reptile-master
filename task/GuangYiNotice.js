/**
 * 大连理工大学光电工程与仪器科学学院官网通知公告抓取模块
 *
 */

const request = require('superagent');
const cheerio = require('cheerio');
const newsType = require('../config/config').type;
const base = 'http://oeis.dlut.edu.cn';
const firstPage = '/xykx/xytz.htm';

let db = require('../models/index');
let news = db.models.News;

function getNoticeTitleAndUrl(url) {
    return new Promise((resolve, reject) => {
        request
            .get(url)
            .end((err, res) => {
                if (err)
                {
                    reject(err.toString());
                }
                else
                {
                    let $ = cheerio.load(res.text);
                    let data = [];
                    let html = $('div.ct');
                    html.find('li').each((index, element) => {
                        data.push({
                            name: element.children[2].children[0].data,
                            url: base + /(\/info[\s\S]{0,200})/.exec(element.children[2].attribs.href)[1]
                        })
                    });

                    html.find('a.Next').each((index, element) => {
                        if (element.children[0].data === '下页') {
                            data.push({
                                next: base + '/xykx/xytz/' + /[\s\S]{0,200}([0-9]{1,10}.htm)$/.exec(element.attribs.href)[1]
                            })
                        }
                    });

                    resolve(data);
                }
            });
    });
}

function getAllData(data) {//获取通知具体数据
    return new Promise((resolve, reject) => {
        request
            .get(data.url)
            .end((err, res) => {
                if (err)
                {
                    reject(err.toString());
                }
                else
                {
                    let $ = cheerio.load(res.text);
                    let header = $('form[name=_newscontent_fromname]');
                    let value = {};
                    value.title = header.find('h1').text();


                    let Time = $('p.time').text();
                    value.dateStr = /^([0-9]{4}年[0-9]{2}月[0-9]{2}日\s[0-9]{2}:[0-9]{2})/.exec(Time)[1];
                    value.from = '';
                    value.url = data.url;
                    value.time = new Date();
                    //该项为原始通知部分网页，若有图片应注意图片的src需添加前缀，同时应该去除所有标签class,开发区校区通知不需要故而省去，只执行添加附件


                    let content = $('div#vsb_content');
                    let files = $('form[name=_newscontent_fromname]').find('ul')
                    files.find('li').each((index, element) => {
                        let temp = element.children[1].attribs.href;
                        element.children[1].attribs.href = base + temp;
                    });


                    let file = [];

                    if (files.length > 0) {
                        files[0].children.forEach(element => {
                            if (element.name === 'li') {
                                file.push({
                                    link: element.children[1].attribs.href,
                                    fileName: element.children[1].children[0].data
                                })
                            }
                        });
                    }
                    //删除多余下载链接
                    let deleteFile = $('span#34E2');
                    deleteFile.remove();
                    //替换图片src
                    content.find('img').each((index,element) => {
                        let srcTemp = element.attribs.src;
                        if(srcTemp.substring(0,4) !== 'http')
                        element.attribs.src = base + element.attribs.src;
                        //顺便去除class
                        if(element.attribs.class != undefined)
                            delete element.attribs.class;
                        if(element.parent.attribs.class != undefined)
                            delete element.parent.attribs.class;

                    });
                    value.body = content.html();
                    value.fileLinks = file;
                    value.type = newsType.EDANotice;
                    value.clickCount = 0;

                    //数据库交互操作
                    news.count({
                        where: {
                            title: value.title
                        }
                    })
                        .then(value1 => {
                            if (value1 === 0)
                            {
                                news.create(value).then(() => {
                                    resolve(true)
                                }).catch((error => {
                                    reject(error.toString());
                                }));
                            }
                            else {
                                news.find({
                                    where: {
                                        title: value.title
                                    }
                                }).then(value2 => {
                                    value2.update(value).then(() => {
                                        resolve(true)
                                    }).catch((error => {
                                        reject(error.toString());
                                    }));
                                })
                            }
                        }).catch(error => {
                        reject(error.toString())
                    });
                }
            })
    });
}

async function start(url) {
    let value = await getNoticeTitleAndUrl(url);
    for (let element of value) {
        if (element.hasOwnProperty('next')) {
            await start(element.next);
        }
        else {
            await getAllData(element);
        }
    }
}

module.exports = async function run() {
    await start(base + firstPage);
};
