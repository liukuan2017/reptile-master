/**
 * 大连理工大学物理学院官网通知公告抓取模块
 *
 */

const request = require('superagent');
const cheerio = require('cheerio');
const newsType = require('../config/config').type;

const base = 'http://physics.dlut.edu.cn';
const firstPage = '/bkspy/jxtz.htm';

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

                    let html = $('div.NRc');

                    html.find('table').each((index, element) => {
                        if(element.children[0].next != undefined)
                        {

                            // let flag = 1;
                            // data.forEach(elementData => {
                            //     if (elementData.name == element.children[0].next.children[0].children[1].children[2].children[0].data) {
                            //         flag = 0;
                            //     }
                            // });


                            // if(flag)
                                if(element.children[0].next.children[0].children[1].children[2].attribs.href[0] === '.') {

                                    data.push({
                                        name: element.children[0].next.children[0].children[1].children[2].children[0].data,
                                        url: base + /(\/info[\s\S]{0,200})/.exec(element.children[0].next.children[0].children[1].children[2].attribs.href)[1]
                                    })

                                }else{
                                    data.push({
                                        name: element.children[0].next.children[0].children[1].children[2].children[0].data,
                                        url: (element.children[0].next.children[0].children[1].children[2].attribs.href)
                                    })
                                }

                        }

                    });


                    html.find('a.Next').each((index, element) => {
                        if (element.children[0].data === '下页') {
                            data.push({
                                next: base + '/bkspy/jxtz/' + /[\s\S]{0,200}([0-9]{1,10}.htm)$/.exec(element.attribs.href)[1]
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
                    let flag = data.url.split('')[7] === 't'
                    if(!flag)//排除教务网页
                    {
                        let header = $('div.NRc');
                        let value = {};//构成对象数组
                        value.title = header.find('h1')[0].children[0].data;
                        let array = /发布时间：([0-9]{4}-[0-9]{2}-[0-9]{2})\s\s\s\s来源：([^z]{0,100})/.exec(header.find('p')[0].children[0].children[0].data);

                        value.dateStr = array[1];
                        value.from = '';

                        let fromTemp = array[2].split('');
                        for(let i = 0;i<fromTemp.length;i++)
                        {
                            if(fromTemp[i] != ' ')
                                value.from += fromTemp[i];
                            else
                                break;
                        }
                        value.url = data.url;
                        value.time = new Date();


                        let content = $('div#vsb_content');//内容
                        if(content.length == 0)
                            content = $('div#vsb_content_501');


                        let files = $('form[name=_newscontent_fromname]').find('ul');
                        let file = [];


                        //读取年份信息，分离老版本中的文件部分
                        let timeTemp = array[1].split('');
                        let timeJudge = '';
                        for(let i = 0;i<timeTemp.length;i++)
                        {
                            if(timeTemp[i] == '-')
                                break;
                            timeJudge += timeTemp[i];
                        }
                        if(parseFloat(timeJudge) > 2014)//2014年以后的文件分离
                        {
                            files.find('li').each((index, element) => {

                                let temp = element.children[1].attribs.href;
                                element.children[1].attribs.href = base + temp;

                            });
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

                        }
                        else//2014年以前的文件分离
                        {
                            files = $('form[name=_newscontent_fromname]').find('a');
                            let fileNameTemp = '';
                            if(files.length > 0)
                            files.each((index, element) => {
                                if(element.children[0].data != null)
                                {
                                    fileNameTemp = element.children[0].data;
                                }
                                else
                                {
                                    fileNameTemp = element.children[0].children[0].data
                                }

                                file.push({
                                    link: element.attribs.href,

                                    fileName: fileNameTemp
                                })
                            });
                            files.parent().remove();
                            files.remove();

                        }


                        //去除class
                        content.find('p').each((index, element) => {
                            if (element.attribs.class != undefined)
                                delete element.attribs.class;
                        });

                        //修改img的相对路径
                        content.find('img').each((index, element) =>{
                            element.attribs.src = base + element.attribs.src;
                        });

                        value.body = content.html();
                        value.fileLinks = file;
                        value.type = newsType.EDANotice;
                        value.clickCount = 0;


                        //数据库交互操作
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
                    else//教务网页特殊处理
                    {
                        let header = $('div.con');
                        let value = {};
                        value.title = header.find('h2')[0].children[0].data;

                        let array = /([0-9]{4}年[0-9]{2}月[0-9]{2}日)/.exec(header.find('tr')[0].children[0].next.next.next.children[0].children[0].data);
                        value.dateStr = array[1];
                        value.from = header.find('tr')[0].children[0].next.children[0].children[0].data;
                        value.url = data.url;
                        value.time = new Date();


                        let content = $('div#vsb_content');

                        //文件下载
                        let files = content.children('p').children('a');
                        let file = [];
                        files.each((index, element) => {
                            //修改下载地址
                                let temp = element.attribs.href.split('');
                                let finTemp = 'http://teach.dlut.edu.cn/'
                                for(let i = 3;i<temp.length;i++)
                                {
                                    finTemp += temp[i];
                                }
                                //替换herf为绝对路径
                                element.children[1].attribs.href = finTemp;
                            //获取文件名&放入数组中
                            file.push({
                                link: element.children[1].attribs.href,
                                fileName: content.children('p').children('a').eq(index).children('span').text()
                            })
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
