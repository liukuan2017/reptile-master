/**
 * 大连理工大学化工与环境生命学部官网通知公告抓取模块
 *
 */

const request = require('superagent');
const cheerio = require('cheerio');
const newsType = require('../config/config').type;
const base = 'http://ceb.dlut.edu.cn';
const firstPage = '/main/xwzx/xssw.htm';

let db = require('../models/index');
let news = db.models.News;

function getNoticeTitleAndUrl(url) {
    return new Promise((resolve, reject) => {
        request
            .get(url)
            .end((err, res) => {
                if (!err) {
                    let $ = cheerio.load(res.text);
                    let data = [];
                    let html = $('table.winstyle70338');
                    html.find('tr').each((index, element) => {
                        if (element.attribs.id !== undefined)
                        {
                            let urlTemp = '';
                            if(element.children[3].children[1].attribs.href[0] == 'h')
                            {
                                urlTemp = element.children[3].children[1].attribs.href;
                            }
                            else if (/(\/info[\s\S]{0,200})/.exec(element.children[3].children[1].attribs.href) == null)
                            {
                                urlTemp = base + /^..\/..\/..(\/[\s\S]{0,200})/.exec(element.children[3].children[1].attribs.href)[1];
                            }
                            else
                            {
                                urlTemp = base + /(\/info[\s\S]{0,200})/.exec(element.children[3].children[1].attribs.href)[0];
                            }

                            data.push({
                                name: element.children[3].children[1].attribs.title,
                                url: urlTemp
                            })
                        }

                    });
                    html.find('a.Next').each((index, element) => {
                        if (element.children[0].data === '下页') {
                            data.push({
                                next: base + '/main/xwzx/xssw/' + /[\s\S]{0,200}([0-9]{1,10}.htm)$/.exec(element.attribs.href)[1]
                            })
                        }
                    });

                    resolve(data);

                }
                else {
                    reject(err.toString());
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
                    let flag = data.url[7] === 'x';
                    if(!flag)//排除学生工作网
                    {


                        let header = $('div.title');
                        let value = {};
                        value.title = header.find('h2')[0].children[0].data;

                        let TimeAndAuthor = $('div.info');

                        let array = /^\s{0,30}时间:([0-9]{4}-[0-9]{2}-[0-9]{2}\s[0-9]{2}:[0-9]{2})来源:([^#]{0,100})$/.exec(TimeAndAuthor.text());

                        value.dateStr = array[1];
                        value.from = '';
                        let fromTemp1 = /作者:([^#]{0,100})$/.exec(array[2]);

                        array[2] = fromTemp1[1];
                        let fromTemp2 = array[2].split('');
                        for(let i = 0;i<fromTemp2.length;i++)
                        {
                            if(fromTemp2[i] !== '点')
                                value.from += fromTemp2[i];
                            else
                                break;
                        }
                        value.url = data.url;
                        value.time = new Date();

                        let content = $('div#vsb_content');
                        if(content.length == 0)
                            content = $('div#vsb_content_503');

                        let files = content.find('ul');
                        let file = [];

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
                            files.remove();
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
                                            })
                                            files.eq(index).remove();
                                        }
                                    }

                                });
                        }


                        //去除class
                        content.find('p').each((index, element) => {
                            if (element.attribs.class != undefined)
                                delete element.attribs.class;
                        });

                        //修改img绝对路径
                        content.find('img').each((index,element) => {
                            let srcTemp = '';
                            if(/^..\/..(\/[^z]{0,100})/.exec(element.attribs.src) == null)
                               srcTemp = element.attribs.src;
                            else
                                srcTemp = /^\.\.\/\.\.(\/[^#]{0,100})/.exec(element.attribs.src)[1];
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
                        let header = $('span.c56750_title');
                        let value = {};
                        value.title = header.text();

                        let Author = $('span.c56750_author');
                        value.from  = /^来源：([^z]{0,100})$/.exec(Author.text())[1];

                        let Time = $('span.c56750_date');
                        value.dateStr = /([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(Time.text())[0];

                        value.url = data.url;
                        value.time = new Date();

                        let content = $('div#vsb_content');

                        let files = $('form[name=_newscontent_fromname]').find('ul');
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
                        //修改图片路径
                        content.find('img').each((index, element) =>{
                            element.attribs.src = 'http://xsc.dlut.edu.cn' + element.attribs.src;
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
