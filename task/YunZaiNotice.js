/**
 * 大连理工大学运载工程与力学学部通知公告抓取模块
 *
 */

const request = require('superagent');
const cheerio = require('cheerio');
const newsType = require('../config/config').type;
//获取首页地址
const base = 'http://vehicle.dlut.edu.cn';
const firstPage = '/xbdt/xbtz.htm';
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
                    let html = $('div.ny_content');

                    html.find('li').each((index, element) => {
                        //console.log(element.children[3].attribs.href);
                        if(element.children[3].name == 'a')
                        {
                            data.push({
                                name: element.children[3].children[0].data,
                                url: base + /(\/info[\s\S]{0,200})/.exec(element.children[3].attribs.href)[1]
                            })
                        }
                        else
                        {
                            data.push({
                                name: element.children[1].children[0].data,
                                url: base + /(\/info[\s\S]{0,200})/.exec(element.children[1].attribs.href)[1]
                            })
                        }

                    });

                    html.find('a.Next').each((index, element) => {

                        if (element.children[0].data === '下页') {
                            data.push({
                                next: base + '/xbdt/xbtz/' + /([0-9]{1,10}.htm)$/.exec(element.attribs.href)[1]
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

                    let array = /^作者：([^#]{0,100})\s\s\s时间：([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(header.find('h2')[0].next.next.children[0].data);
                    value.dateStr = array[2];
                    value.from = array[1];
                    value.url = data.url;
                    value.time = new Date();


                    let content = $('div#vsb_content');
                    if(content.length == 0)
                        content = $('div#vsb_content_2');
                    if(content.length == 0)
                        content = $('div#vsb_content_6');
                    if(content.length == 0)
                        content = $('div#vsb_content_4');
                    let files = $('form[name=_newscontent_fromname]').find('ul');
                    files.find('li').each((index, element) => {
                        let temp = element.children[1].attribs.href;
                        element.children[1].attribs.href = base + temp;
                    });

                    let file = [];
                    if (files.length > 0) {
                        files[0].children.forEach(element => {
                            if (element.name === 'li') {
                                //if(data.url == 'http://vehicle.dlut.edu.cn/info/1050/14448.htm')
                                    //console.log(element.children[1].children.length);
                                if(element.children[1].children.length > 0)
                                {
                                    file.push({
                                        link: element.children[1].attribs.href,
                                        fileName: element.children[1].children[0].data
                                    })
                                }
                            }
                        });
                    }

                    //去除class
                    content.find('p').each((index, element) => {
                        if (element.attribs.class != undefined)
                            delete element.attribs.class;
                    });
                    content.find('tr').each((index, element) => {
                        if (element.attribs.class != undefined)
                            delete element.attribs.class;
                    });
                    content.find('div').each((index, element) => {
                        if (element.attribs.class != undefined)
                            delete element.attribs.class;
                    });

                    //替换图片src
                    content.find('img').each((index, element) =>{
                        element.attribs.src = base + element.attribs.src;
                        if (element.attribs.class != undefined)
                            delete element.attribs.class;
                    });


                    value.body = content.html();
                    value.fileLinks = file;
                    value.type = newsType.EDANotice;
                    value.clickCount = 0;

                    news.count({
                        where: {
                            url: value.url
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
                                        url: value.url
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
