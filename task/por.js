//title 商品名称，促销活动主题
//imgurl 商品图片，促销活动海报
//price 价格
//area 销售地区
//category 分类
//weight 重量
//edibleMethod 食用方法
//saveMethod 保存方法
//description 商品描述
//version 网页分类
//type 食物类型分类


const request = require('superagent');
const cheerio = require('cheerio');

const base = 'http://www.7-11bj.com.cn';
const firstPage = '/?products.html';

let db = require('../models/index');
let details = db.models.details;


function getUrl(url){
    return  new Promise((resolve,reject) => {
        request
            .get(url)
            .end((err,res) =>{
                if(err)
                {
                    reject(err.toString());
                }
                else
                {
                    let $ = cheerio.load(res.text);
                    let data = [];
                    let html = $('#mainContentsBox').find('dl');
                    html.find('dd').each((index,element) => {
                        let typeTemp = '';
                        if(element.children[0].attribs.href === './?products01/id/207.html')
                            typeTemp = '便民食坊';
                        else if(element.children[0].attribs.href === './?products01/id/209.html')
                            typeTemp = '好炖';
                        else if(element.children[0].attribs.href === './?products01/id/211.html')
                            typeTemp = '甜品面包';
                        else if(element.children[0].attribs.href === './?products01/id/213.html')
                            typeTemp = 'SEVENSELECT商品';
                        data.push({
                            url : base + /^.(\/[\s\S]{0,200}$)/.exec(element.children[0].attribs.href)[1],
                            type: typeTemp
                        })
                    });

                    html.find('dt').each((index,element) => {
                        let typeTemp = '';
                        if(element.children[0].attribs.href === './?products01/id/206.html')
                            typeTemp = '早点';
                        else if(element.children[0].attribs.href === './?products01/id/208.html')
                            typeTemp = '饭团寿司';
                        else if(element.children[0].attribs.href === './?products01/id/210.html')
                            typeTemp = '三明治汉堡包';
                        else if(element.children[0].attribs.href === './?products01/id/212.html')
                            typeTemp = '面类其他';
                        data.push({
                            url : base + /^.(\/[\s\S]{0,200}$)/.exec(element.children[0].attribs.href)[1],
                            type: typeTemp
                        })
                    });
                    resolve(data);
                }
            });
    })
}


function getData(data)
{
    return new Promise((resolve,reject) => {
        request
            .get(data.url)
            .end((err,res) => {
                if(err)
                {
                    reject(err.toString());
                }
                else
                {
                    let $ = cheerio.load(res.text);
                    let dataValue = [];
                    let value = {};
                    let content = $('#lightbox').children('dl');
                    content.find('dd').each((index,element) => {
                        value.type = data.type;
                        value.title = element.children[3].children[0].data;
                        value.imgurl = base + '/' + element.children[1].children[0].attribs.src;
                        value.price = element.children[5].children[0].data;
                        value.area = /^销售地区 ：([^#]{0,200})/.exec(element.children[7].children[0].data)[1];
                        value.category = /^分类 ：([^#]{0,200})/.exec(element.children[9].children[0].data)[1];
                        value.weight = /^重量 ：([^#]{0,200})/.exec(element.children[11].children[0].data)[1];
                        value.description = element.children[13].children[0].children[0].data;
                        value.version = '商品介绍';

                        dataValue.push(value);
                    });
                    console.log(dataValue);
                    resolve(true);
                }
        })
    });
}

async function start(url) {
    let value = await getUrl(url);
    for(let element of value)
    {
        await  getData(element);
    }
}

async function run() {
    await start(base + firstPage);
}

run().then(value => {
    console.log('success');
}).catch(err => {
    console.log(err.toString());
});
