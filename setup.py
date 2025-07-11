from setuptools import setup, find_packages

with open("requirements.txt") as f:
    install_requires = f.read().strip().split("\n")

# get version from __version__ variable in restaurant_management/__init__.py
from restaurant_management import __version__ as version

setup(
    name="restaurant_management",
    version=version,
    description="Restaurant Management System by IMOGI",
    author="PT. Inovasi Terbaik Bangsa",
    author_email="danny.a.pratama@cao-group.co.id",
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=install_requires
)


