const mongoose = require('mongoose');
const Store = mongoose.model('Store');
const multer = require('multer'); // Node.js middleware for handling 'multipart/form-data'
const jimp = require('jimp'); // used to resize photo
const uuid = require('uuid'); // unique id

const multerOptions = {
    storage: multer.memoryStorage(),
    fileFilter(req, file, next) {
        const isPhoto = file.mimetype.startsWith('image/');
        if (isPhoto) {
            next(null, true);
        } else {
            next({ message: 'That filetype isn\'t allowed.' }, false);
        }
    }
};

exports.homePage = (req, res) => {
    res.render('index');
};

exports.addStore = (req, res) => {
    res.render('editStore', {
        title: 'Add Store'
    });
};

exports.upload = multer(multerOptions).single('photo');

exports.resize = async (req, res, next) => {
    // check if there is no new file to resize
    if (!req.file) {
        next(); // skip to the next middleware
        return; // exit this function
    }
    
    const extension = req.file.mimetype.split('/')[1];
    req.body.photo = `${uuid.v4()}.${extension}`;

    // now we resize
    const photo = await jimp.read(req.file.buffer);
    await photo.resize(800, jimp.AUTO);
    await photo.write(`./public/uploads/${req.body.photo}`);

    // once we have written the photo to our filesystem, keep going!
    next();
};

exports.createStore = async (req, res) => {
    req.body.author = req.user._id;
    const store = new Store(req.body);
    const result = await store.save();
    
    req.flash('success', `Successfully created ${store.name}. Leave a review?`);
    res.redirect(`/store/${result.slug}`);
};

exports.getStores = async (req, res) => {
    // 1. Query the database
    const stores = await Store.find();
    res.render('stores', {
       title: 'Stores',
       stores: stores
    });
};

const confirmOwner = (store, user) => {
    if (!store.author.equals(user._id)) {
        throw Error('You do not own this store');
    }
};

exports.editStore = async (req, res) => {
    // 1. Find the store given the ID
    const store = await Store.findById(req.params.id);

    // 2. TODO Confirm they are the owner of the store
    confirmOwner(store, req.user);

    // 3. Render out the edit form so the user can update their store
    res.render('editStore', {
        title: `Edit ${store.name}`,
        store
    });
};

exports.updateStore = async (req, res) => {
    // set the location data to be a point
    req.body.location.type = 'Point';

    let store = await Store.findOneAndUpdate(
        {
            _id: req.params.id
        },
        req.body,
        {
            new: true, // return the new store instead of the old one
            runValidators: true
        }
    ).exec();

    req.flash('success', `Successfully updated <strong>${store.name}</strong>. <a href="/stores/${store.slug}">View Store</a>`);
    res.redirect(`/stores/${store._id}/edit`);
};

exports.getStoresBySlug = async (req, res, next) => {
    const store = await Store.findOne({ slug: req.params.slug }).populate('author');
    
    if (!store) { // in case find none store, it returns null. then next()
        next();
        return;
    }
    
    res.render('store', {
        title: `${store.name}`,
        store
    });
};

exports.getStoresByTag = async (req, res) => {
    const tag = req.params.tag;
    const tagQuery = tag || { $exists: true }; // if no tag, it will fall back that gives you any stores that contain a tags property 

    // const tags = await Store.getTagsList();
    const tagsPromise = Store.getTagsList();
    // res.json(tags);

    const storesPromise = Store.find({ tags: tagQuery }); // automatically searching the tag

    const [tags, stores] = await Promise.all([tagsPromise, storesPromise]); // wait both promises to come back
    // res.send(result);

    res.render('tag', {
        tags,
        title: 'Tags',
        tag,
        stores
    });
};
