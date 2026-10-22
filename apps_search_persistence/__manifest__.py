{
    'name': 'Apps Search Persistence',
    'summary': 'Keep Apps search and view after a module upgrade',
    'version': '19.0.1.0.6',
    'category': 'Technical',
    'author': 'SARANG T',
    'license': 'LGPL-3',
    "images": ["static/description/banner.png"],
    'depends': ['web'],
    'assets': {
        'web.assets_backend': [
            'apps_search_persistence/static/src/js/apps_search_persistence.js',
            'apps_search_persistence/static/src/js/upgrade_progress.js',
            'apps_search_persistence/static/src/scss/upgrade_progress.scss',
        ],
    },
    'application': False,
    'installable': True,
    'auto_install': False,
}
