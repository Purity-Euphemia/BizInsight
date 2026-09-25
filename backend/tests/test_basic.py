import pytest
from backend.app import create_app



def test_index_page(client):
    """Test that the index page loads successfully."""
    response = client.get('/')
    assert response.status_code == 200
    assert b'BizInsight' in response.data
