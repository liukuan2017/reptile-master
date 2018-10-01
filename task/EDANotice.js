/**
 * 大连理工大学开发区校区官网通知公告抓取模块
 *
 * @Author lcr
 * @CreateDate 18-9-5
 */

const request = require('superagent');
const cheerio = require('cheerio');
const newsType = require('../config/config').type;
//获取首页地址
const base = 'http://eda.dlut.edu.cn';
const firstPage = '/ggjx/tzgg.htm'; //新闻首页

let db = require('../models/index');
let news = db.models.News;

function getNoticeTitleAndUrl(url) {//获得通知的标题和URL
    return new Promise((resolve, reject) => {
        request
            .get(url)//发送get请求，利用end发送请求
            .end((err, res) => {
                if (err)
                {
                    reject(err.toString());//请求错误设置promise为reject
                }
                else //否则利用cheerio进行数据操作
                {
                    let $ = cheerio.load(res.text);//加载未解析前的响应内容
                    let data = [];//创建数据数组
                    let html = $('div.ny_list');//选取信息链接所在的最大的class ny_list

                    //选取当前页面的URL
                    //对于选中元素，遍历其中的所有li元素，index选择器位置，element当前选择的元素。


                    html.find('li').each((index, element) => {
                        // console.log(element.children[0].children[0].data);
                        data.push({
                            name: element.children[0].children[0].data,
                            url: base + /(\/info[\s\S]{0,200})/.exec(element.children[0].attribs.href)[1]
                            // \转义/ + info + 匹配任何空白字符\s\S +限制前者的位置
                        })
                    });

                    html.find('a.Next').each((index, element) => {
                        // console.log(element.attribs.href);
                        if (element.children[0].data === '下页') {
                            //console.log(element.attribs.href);
                            //console.log( /[\s\S]{0,200}([0-9]{1,10}.htm)$/.exec(element.attribs.href));
                            data.push({                       //先匹配200位的非空字符再匹配数字   0-9的数字十位
                                                              //第一次返回查询内容，第二次返回查询结果，选数组第二个元素
                                next: base + '/ggjx/tzgg/' + /[\s\S]{0,200}([0-9]{1,10}.htm)$/.exec(element.attribs.href)[1]
                            })
                        }
                    });

                    resolve(data);//请求成功，将promise设置成resolve。将数据设置成接受成功状态
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
                    let header = $('div.header_con');
                    let value = {};//构成对象数组
                    value.title = header.find('h3')[0].children[0].data;
                    //^匹配输入字符串开始的位置 + 对于时间的匹配 +

                    let array = /^时间：([0-9]{4}-[0-9]{2}-[0-9]{2})\s作者：([^z]{0,100})$/.exec(header.find('p')[0].children[0].data);
                    //console.log(array);
                    value.dateStr = array[1];
                    value.from = array[2];
                    value.url = data.url;
                    value.time = new Date();
                    //该项为原始通知部分网页，若有图片应注意图片的src需添加前缀，同时应该去除所有标签class,开发区校区通知不需要故而省去，只执行添加附件


                    let content = $('div#vsb_content');//内容
                    let files = $('form[name=_newscontent_fromname] > ul');//选取表单中的ul
                    files.find('li').each((index, element) => {
                        let temp = element.children[1].attribs.href;
                        //替换herf为绝对路径
                        element.children[1].attribs.href = base + temp;
                    });

                    //content.append(files.html());
                    let file = [];//创建文件数组

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
