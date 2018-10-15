/**
 * 大连理工大学建设工程学部官网通知公告抓取模块
 */

const request = require('superagent');
const cheerio = require('cheerio');
const newsType = require('../config/config').type;
const base = 'http://sche.dlut.edu.cn';
const firstPage = '/bkspy/xsgz/sy/zytz.htm';
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
                    let html = $('table.winstyle74548');

                    html.find('tr').each((index, element) => {
                        if (element.attribs.id !== undefined)
                        {
                            data.push({
                                name: element.children[3].children[1].attribs.title,
                                url: base + /(\/info[\s\S]{0,200})$/.exec(element.children[3].children[1].attribs.href)[0]
                            })
                        }
                    });

                    html.find('a.Next').each((index, element) => {
                        if (element.children[0].data === '下页') {
                            data.push({
                                next: base + '/bkspy/xsgz/sy/zytz/' + /([0-9]{1,10}.htm)$/.exec(element.attribs.href)[1]
                            })
                        }
                    });
                    resolve(data);
                }
            });
    });
}
function getAllData(data) {
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
                    let header = $('form[name=form62291a]');
                    if(header.length)//不考虑已被撤销的通知 eg.http://sche.dlut.edu.cn/info/1236/6600.htm
                    {
                        let value = {};
                        value.title = header.find('td.titlestyle62291').text();
                        if(value.title.length == 0)
                            console.log(data.url);
                        value.dateStr = /^[\s]{0,100}([^#]{0,100})$/.exec(header.find('span.timestyle62291').text())[1];
                        value.from = /^([^\s]{0,100})/.exec(header.find('span.authorstyle62291').text())[0];
                        value.url = data.url;
                        value.time = new Date();

                        let content = $('div#vsb_content');//内容
                        if(content.length === 0)
                            content = $('div#vsb_content_2');
                        if(content.length === 0)
                            content = $('div#vsb_content_4');
                        if(content.length === 0)
                            content = $('div#vsb_content_501');
                        if(content.length === 0)
                            content = $('div#vsb_content_3');



                        let files = $('div#div_vote_id').parent().parent().next().next();
                        let file = [];


                        let timeTemp = value.dateStr;
                        let yearJudge = '';
                        let monthJudge = '';
                        let CountTime = 0;
                        for(let i = 0;i<timeTemp.length;i++)
                        {
                            if(timeTemp[i] == '-')
                            {
                                CountTime = i;
                                break;
                            }

                            yearJudge += timeTemp[i];
                        }
                        for(let i = CountTime + 1;i<timeTemp.length;i++)
                        {
                            if(timeTemp[i] == '-')
                                break;
                            monthJudge += timeTemp[i];
                        }
                        if(parseFloat(yearJudge) > 2014)//2014年以后的文件分离
                        {
                            files.find('a').each((index, element) => {
                                let temp = element.attribs.href;
                                //替换herf为绝对路径
                                element.attribs.href = base + temp;
                            });
                            if(files.length > 0)
                            {
                                files.find('a').each((index, element) => {
                                file.push({
                                    link: element.attribs.href,
                                    fileName: element.children[0].children[0].data
                                });

                            });
                            }
                        }
                        else
                        {
                                files = content.find('a');
                                if(files.length > 0)
                                    files.each((index, element) => {
                                        if(element.children[0] != undefined)
                                        {

                                            if(element.children[0].name == 'u')
                                            {
                                                file.push({
                                                    link: element.attribs.href,
                                                    fileName: element.children[0].children[0].data
                                                });
                                                files.eq(index).remove();
                                            }
                                            if(element.children[0].name == 'img')
                                                files.eq(index).remove();
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

                        //修改img绝对路径
                        content.find('img').each((index,element) => {
                            let srcTemp = '';
                            if(/^..\/..(\/[^z]{0,100})/.exec(element.attribs.src) == null)
                            {
                                if(element.attribs.src.substring(0,4) !== 'file')
                                    srcTemp = element.attribs.src;
                            }
                            else
                                srcTemp = /^\.\.\/\.\.(\/[^#]{0,100})/.exec(element.attribs.src)[1];

                            if(element.attribs.src.substring(0,4) !== 'file')
                                element.attribs.src = base +  srcTemp;


                            //顺便去除class
                            if(element.attribs.class != undefined)
                                delete element.attribs.class;

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
                    else
                    {
                        resolve(true);
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
