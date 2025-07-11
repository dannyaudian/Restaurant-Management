import click
import frappe
from frappe.commands import pass_context

@click.command('create-restaurant-demo-data')
@pass_context
def create_demo_data(context):
    """Create demo data for Restaurant Management App"""
    from restaurant_management.setup.create_demo_data import execute
    execute()

commands = [
    create_demo_data
]